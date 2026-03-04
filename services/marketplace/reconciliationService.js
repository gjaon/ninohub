const MarketplaceOrder = require("../../models/marketplaceOrderModel");
const { fetchProviderOrder } = require("./providerClient");
const { recordMetric } = require("./metricsService");
const { publishEvent } = require("./businessEventBus");

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

const normalizeStatus = (status) =>
  PROVIDER_TO_LOCAL_STATUS[String(status || "").toLowerCase()] || null;

const normalizeProviderLine = (line = {}) => ({
  ...line,
  lineId: line.lineId || line.id || null,
  listingId: line.listingId || line.productId || line.product || null,
  productId: line.productId || line.product || null,
  productName: line.productName || line.name || "Item",
  variantId: line.variantId || null,
  variantName: line.variantName || null,
  parentGroupId: line.parentGroupId || line.groupId || null,
  groupName: line.groupName || null,
  lineImage:
    line.variantImage
    || line.variantImageUrl
    || line.selectedImage
    || line.image
    || line.groupImage
    || line.groupImageUrl
    || "",
  decisionStatus: line.decisionStatus || line.status || null,
  decisionReason: line.decisionReason || line.reason || null,
});

const reconcileMarketplaceOrders = async ({ limit = 50 } = {}) => {
  const openStatuses = ["placed", "payment_confirmed", "accepted", "processing", "shipped"];

  const candidates = await MarketplaceOrder.find({
    providerOrderId: { $ne: null },
    status: { $in: openStatuses },
  })
    .sort({ updatedAt: 1 })
    .limit(limit);

  let reconciled = 0;
  let skipped = 0;

  for (const order of candidates) {
    try {
      const providerOrder = await fetchProviderOrder({ providerOrderId: order.providerOrderId });
      if (!providerOrder?._id) {
        skipped += 1;
        continue;
      }

      const nextStatus = normalizeStatus(providerOrder.status);
      if (!nextStatus || nextStatus === order.status) {
        continue;
      }

      order.status = nextStatus;
      order.providerStatus = nextStatus;
      order.lastProviderSyncAt = new Date();
      if (Array.isArray(providerOrder.lines)) {
        order.lineSnapshot = providerOrder.lines.map(normalizeProviderLine);
        order.lineDecisions = order.lineSnapshot
          .filter((line) => line.decisionStatus || line.decisionReason)
          .map((line) => ({
            lineId: line.lineId,
            productId: line.productId,
            decisionStatus: line.decisionStatus,
            decisionReason: line.decisionReason,
            occurredAt: new Date(),
          }));
      }
      order.auditTrail.push({
        action: "reconciliation_status_applied",
        occurredAt: new Date(),
        metadata: {
          providerOrderId: order.providerOrderId,
          status: nextStatus,
        },
      });
      await order.save();

      await recordMetric("marketplace.reconciliation.corrected", {
        status: nextStatus,
      });

      await publishEvent({
        eventType: `marketplace.order.${nextStatus}`,
        source: "marketplace.reconciliation",
        buyerId: order.buyerId,
        correlationId: order.correlationId,
        payload: {
          orderId: order.orderId,
          providerOrderId: order.providerOrderId,
          status: nextStatus,
        },
      });

      reconciled += 1;
    } catch (_error) {
      skipped += 1;
      await recordMetric("marketplace.reconciliation.fetch_failed");
    }
  }

  return {
    checked: candidates.length,
    reconciled,
    skipped,
  };
};

module.exports = {
  reconcileMarketplaceOrders,
};
