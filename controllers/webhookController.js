const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const { verifyTransaction } = require("../services/marketplace/paystackService");
const InventoryHold = require("../models/inventoryHoldModel");
const MarketplaceOrder = require("../models/marketplaceOrderModel");
const Order = require("../models/orderModel");
const {
  finalizeMarketplaceCheckoutByReference,
} = require("./marketplaceController");
const {
  recordInboundDelivery,
  markProcessing,
  markProcessed,
  markRetryOrExhausted,
} = require("../services/marketplace/webhookDeliveryService");
const { publishEvent } = require("../services/marketplace/businessEventBus");
const { recordMetric } = require("../services/marketplace/metricsService");
const {
  refreshListingProjectionFromWebhook,
} = require("../services/marketplace/inventoryProjectionService");

const PROVIDER_TO_LOCAL_STATUS = {
  placed: "placed",
  payment_confirmed: "payment_confirmed",
  accepted: "accepted",
  rejected: "rejected",
  processing: "processing",
  shipped: "shipped",
  delivered: "delivered",
  failed: "failed",
  cancelled: "cancelled",
};

const getRawBodyString = (req) => {
  if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.toString("utf8");
  }
  return JSON.stringify(req.body || {});
};

const verifyPaystackSignature = (req) => {
  const signature = req.get("x-paystack-signature") || "";
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  const digest = crypto
    .createHmac("sha512", secret)
    .update(getRawBodyString(req))
    .digest("hex");
  return signature && digest === signature;
};

const verifyProviderSignature = (req) => {
  const signature = req.get("x-marketplace-signature") || req.get("x-provider-signature") || "";
  const secret = process.env.MARKETPLACE_PROVIDER_WEBHOOK_SECRET || "";
  if (!secret) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(getRawBodyString(req))
    .digest("hex");

  if (!signature || !digest || signature.length !== digest.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
};

const normalizeMarketplaceStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  return PROVIDER_TO_LOCAL_STATUS[normalized] || null;
};

const toLegacyOrderStatus = (marketplaceStatus) => {
  const normalized = String(marketplaceStatus || "").toLowerCase();
  const statusMap = {
    placed: "pending",
    payment_confirmed: "paid",
    accepted: "processing",
    processing: "processing",
    shipped: "shipped",
    delivered: "delivered",
    rejected: "cancelled",
    failed: "cancelled",
    cancelled: "cancelled",
  };

  return statusMap[normalized] || "processing";
};

const resolveProviderEventFields = (delivery) => {
  const payload = delivery.payload || {};
  const eventType = String(payload.type || payload.eventType || "");
  const eventId = String(payload.id || delivery.eventId || "");
  const eventData = payload.data && typeof payload.data === "object" ? payload.data : payload;
  const occurredAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

  return {
    eventType,
    eventId,
    eventData,
    occurredAt,
    payload,
  };
};

const normalizeProviderLineSnapshot = (line = {}) => {
  const preferredImage =
    line.variantImage
    || line.variantImageUrl
    || line.selectedImage
    || line.image
    || line.groupImage
    || line.groupImageUrl
    || "";

  return {
    ...line,
    lineId: line.lineId || line.id || null,
    productId: line.productId || line.product || null,
    productName: line.productName || line.name || "Item",
    variantId: line.variantId || null,
    variantName: line.variantName || null,
    parentGroupId: line.parentGroupId || line.groupId || null,
    groupName: line.groupName || null,
    decisionStatus: line.decisionStatus || line.status || null,
    decisionReason: line.decisionReason || line.reason || null,
    lineImage: preferredImage,
  };
};

const processPaystackDelivery = async (delivery) => {
  const eventType = delivery.payload?.event;
  const reference = delivery.reference;

  if (!reference || eventType !== "charge.success") {
    return;
  }

  const existingOrder = await MarketplaceOrder.findOne({ paymentReference: reference });
  if (existingOrder) {
    await Order.updateOne(
      { paystackReference: reference },
      { $set: { status: toLegacyOrderStatus(existingOrder.status) } }
    );
    return;
  }

  const hold = await InventoryHold.findOne({ paymentReference: reference });
  if (!hold) {
    return;
  }

  const verified = await verifyTransaction(reference);
  if (verified.status !== "success") {
    throw new Error(`Paystack verify status ${verified.status}`);
  }

  await publishEvent({
    eventType: "marketplace.payment.verified",
    source: "webhook.paystack",
    buyerId: hold.buyerId,
    correlationId: hold.correlationId,
    payload: {
      reference,
      amount: Number(verified.amount || 0) / 100,
      holdId: hold.holdId,
    },
  });

  try {
    await finalizeMarketplaceCheckoutByReference({
      reference,
      status: "success",
      authenticatedBuyerId: hold.buyerId,
      shippingAddress: hold.shippingAddress || {},
      source: "webhook.paystack",
    });
  } catch (error) {
    throw new Error(error?.message || "Webhook payment finalization failed");
  }
};

const processProviderDelivery = async (delivery) => {
  const { eventType, eventId, eventData, occurredAt, payload } = resolveProviderEventFields(delivery);
  const normalizedEventType = String(eventType || "").toLowerCase();

  if (normalizedEventType === "marketplace.listing.updated") {
    const listingId = String(
      eventData?.listingId
      || eventData?.id
      || eventData?.productId
      || eventData?.groupId
      || ""
    ).trim();

    const listingRefresh = await refreshListingProjectionFromWebhook({
      listingId,
      trigger: "webhook-provider-listing-updated",
      correlationId:
        payload?.correlationId
        || payload?.metadata?.correlationId
        || null,
    });

    await recordMetric("marketplace.webhook.provider.listing_updated", {
      refresh: listingRefresh?.refreshed ? "refreshed" : "fallback",
      fallback: listingRefresh?.fallbackSync ? "yes" : "no",
      listingId: listingId || "missing",
    });

    await publishEvent({
      eventType: eventType || "marketplace.listing.updated",
      source: "webhook.provider",
      buyerId: null,
      correlationId: payload?.metadata?.correlationId || payload?.correlationId || null,
      payload: {
        ...payload,
        listingRefresh,
      },
    });

    return;
  }

  const providerOrderId = String(eventData.orderId || "");
  const providerOrderNumber = String(eventData.orderNumber || "");

  let order = null;
  if (providerOrderId) {
    order = await MarketplaceOrder.findOne({ providerOrderId });
  }
  if (!order && providerOrderNumber) {
    order = await MarketplaceOrder.findOne({ providerOrderNumber });
  }

  if (!order) {
    await recordMetric("marketplace.webhook.provider.unmatched_order");
  }

  const inferredStatus =
    normalizeMarketplaceStatus(eventData.status)
    || normalizeMarketplaceStatus(eventType.replace("marketplace.order.", ""));

  if (order && (inferredStatus || Array.isArray(eventData.lines))) {
    const lagMs = Math.max(0, Date.now() - occurredAt.getTime());
    const lagSeconds = Math.floor(lagMs / 1000);

    if (inferredStatus) {
      order.providerStatus = inferredStatus;
      order.status = inferredStatus;
    }
    order.lastProviderSyncAt = occurredAt;
    order.providerLastEventId = eventId || order.providerLastEventId;
    order.providerCorrelationId =
      payload?.correlationId
      || payload?.metadata?.correlationId
      || order.providerCorrelationId;

    if (Array.isArray(eventData.lines)) {
      order.lineSnapshot = eventData.lines.map(normalizeProviderLineSnapshot);
      order.lineDecisions = order.lineSnapshot
        .filter((line) => line.decisionStatus || line.decisionReason)
        .map((line) => ({
          lineId: line.lineId,
          productId: line.productId,
          decisionStatus: line.decisionStatus,
          decisionReason: line.decisionReason,
          occurredAt,
        }));
    }

    order.auditTrail.push({
      action: "provider_event_applied",
      occurredAt: new Date(),
      metadata: {
        providerEventType: eventType,
        providerEventId: eventId,
        providerStatus: inferredStatus || order.status,
      },
    });

    await order.save();

    await Order.updateOne(
      { paystackReference: order.paymentReference },
      {
        $set: {
          status: toLegacyOrderStatus(inferredStatus || order.status),
        },
      }
    );

    await recordMetric("marketplace.webhook.provider.order_updated", {
      status: inferredStatus || order.status,
    });
    await recordMetric("marketplace.order.sync_lag_seconds", {
      bucket: lagSeconds >= 300 ? ">=300" : lagSeconds >= 60 ? "60-299" : "<60",
    });
  }

  await publishEvent({
    eventType: eventType || "marketplace.provider.event",
    source: "webhook.provider",
    buyerId: order?.buyerId || null,
    correlationId: payload?.metadata?.correlationId || payload.correlationId || null,
    payload,
  });
};

const ingestPaystackWebhook = asyncHandler(async (req, res) => {
  const signatureVerified = verifyPaystackSignature(req);
  if (!signatureVerified) {
    await recordMetric("marketplace.webhook.paystack.signature_failed");
    return res.status(401).json({ message: "Invalid webhook signature" });
  }

  const eventId = req.body?.data?.id ? String(req.body.data.id) : String(req.body?.data?.reference || req.body?.event || Date.now());
  const reference = req.body?.data?.reference || null;

  const recorded = await recordInboundDelivery({
    provider: "paystack",
    eventId,
    reference,
    signatureVerified,
    payload: req.body,
  });

  if (recorded.duplicate) {
    await recordMetric("marketplace.webhook.paystack.duplicate");
    return res.status(200).json({ message: "Duplicate ignored" });
  }

  await recordMetric("marketplace.webhook.paystack.received");

  res.status(202).json({ message: "Accepted" });

  setImmediate(async () => {
    try {
      await markProcessing(recorded.delivery.deliveryId);
      await processPaystackDelivery(recorded.delivery);
      await markProcessed(recorded.delivery.deliveryId);
      await recordMetric("marketplace.webhook.paystack.processed");
    } catch (error) {
      await markRetryOrExhausted({
        deliveryId: recorded.delivery.deliveryId,
        errorMessage: error.message,
      });
      await recordMetric("marketplace.webhook.paystack.retry_scheduled");
    }
  });
});

const ingestProviderWebhook = asyncHandler(async (req, res) => {
  const signatureVerified = verifyProviderSignature(req);
  if (!signatureVerified) {
    await recordMetric("marketplace.webhook.provider.signature_failed");
    return res.status(401).json({ message: "Invalid webhook signature" });
  }

  const eventId = String(
    req.get("x-marketplace-event-id")
      || req.body?.id
      || req.body?.eventId
      || Date.now()
  );
  const reference = req.body?.data?.orderId || req.body?.orderId || req.body?.reference || null;

  const recorded = await recordInboundDelivery({
    provider: "provider",
    eventId,
    reference,
    signatureVerified,
    payload: req.body,
  });

  if (recorded.duplicate) {
    await recordMetric("marketplace.webhook.provider.duplicate");
    return res.status(200).json({ message: "Duplicate ignored" });
  }

  await recordMetric("marketplace.webhook.provider.received");

  res.status(202).json({ message: "Accepted" });

  setImmediate(async () => {
    try {
      await markProcessing(recorded.delivery.deliveryId);
      await processProviderDelivery(recorded.delivery);
      await markProcessed(recorded.delivery.deliveryId);
      await recordMetric("marketplace.webhook.provider.processed");
    } catch (error) {
      await markRetryOrExhausted({
        deliveryId: recorded.delivery.deliveryId,
        errorMessage: error.message,
      });
      await recordMetric("marketplace.webhook.provider.retry_scheduled");
    }
  });
});

module.exports = {
  ingestPaystackWebhook,
  ingestProviderWebhook,
  processPaystackDelivery,
  processProviderDelivery,
};
