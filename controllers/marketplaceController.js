const asyncHandler = require("express-async-handler");
const { v4: uuidv4 } = require("uuid");
const Cart = require("../models/cartModel");
const Order = require("../models/orderModel");
const InventoryHold = require("../models/inventoryHoldModel");
const MarketplaceOrder = require("../models/marketplaceOrderModel");
const MarketplaceProductCache = require("../models/marketplaceProductCacheModel");
const MarketplaceWebhookEndpoint = require("../models/marketplaceWebhookEndpointModel");
const BusinessEvent = require("../models/businessEventModel");
const User = require("../models/userModel");
const { getMarketplaceConfig } = require("../config/marketplaceConfig");
const { issuePartnerSession } = require("../services/marketplace/publicAuthService");
const {
  buildBuyerActionKey,
  reserveIdempotency,
  markIdempotencySuccess,
  markIdempotencyFailure,
} = require("../services/marketplace/idempotencyService");
const {
  createProviderOrder,
  confirmProviderOrderPayment,
} = require("../services/marketplace/providerClient");
const {
  initializeRedirectTransaction,
  verifyTransaction,
} = require("../services/marketplace/paystackService");
const {
  syncInventoryProjection,
  getProjectedProducts,
} = require("../services/marketplace/inventoryProjectionService");
const { publishEvent } = require("../services/marketplace/businessEventBus");
const { recordMetric, getMetrics } = require("../services/marketplace/metricsService");

const mapCartItemsToProvider = (items = []) =>
  items.map((item, index) => ({
    lineId: String(item.lineId || `line_${index + 1}`),
    productId: String(item.productId || item.id || ""),
    listingId: String(item.listingId || item.parentGroupId || item.productId || item.id || ""),
    variantId: String(item.variantId || ""),
    quantity: Number(item.quantity || 0),
  }));

const toMonetaryNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/\s+/g, "")
      .replace(/,/g, "")
      .replace(/NGN/gi, "")
      .replace(/₦/g, "")
      .replace(/[^0-9.-]/g, "");

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const calculateCartAmount = (items = []) =>
  items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = toMonetaryNumber(item.price, 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return sum;
    }
    return sum + quantity * unitPrice;
  }, 0);

const resolveCartAmount = async (cart) => {
  const items = Array.isArray(cart?.items) ? cart.items : [];

  let directSum = 0;
  let hasAtLeastOneValidLine = false;
  const unresolvedProductIds = [];

  for (const item of items) {
    const quantity = Math.max(0, Number(item?.quantity || 0));
    if (!quantity) continue;

    const unitPrice = toMonetaryNumber(
      item?.price ?? item?.unitPrice ?? item?.basePrice ?? item?.amount,
      NaN
    );

    if (Number.isFinite(unitPrice) && unitPrice > 0) {
      directSum += unitPrice * quantity;
      hasAtLeastOneValidLine = true;
      continue;
    }

    unresolvedProductIds.push(String(item?.productId || item?.id || "").trim());
  }

  let projectionSum = 0;
  if (unresolvedProductIds.length) {
    const projectionRows = await MarketplaceProductCache.find({
      providerProductId: { $in: unresolvedProductIds.filter(Boolean) },
    })
      .select("providerProductId price")
      .lean();

    const priceByProductId = new Map(
      projectionRows.map((row) => [String(row.providerProductId), toMonetaryNumber(row.price, 0)])
    );

    for (const item of items) {
      const quantity = Math.max(0, Number(item?.quantity || 0));
      if (!quantity) continue;

      const productId = String(item?.productId || item?.id || "").trim();
      if (!productId || !priceByProductId.has(productId)) continue;

      const projectionPrice = toMonetaryNumber(priceByProductId.get(productId), 0);
      if (projectionPrice > 0) {
        projectionSum += projectionPrice * quantity;
      }
    }
  }

  const cartTotalPrice = toMonetaryNumber(cart?.totalPrice, 0);
  const calculated = directSum + projectionSum;

  const amount = calculated > 0
    ? calculated
    : (hasAtLeastOneValidLine ? directSum : cartTotalPrice);

  return {
    amount,
    diagnostics: {
      itemCount: items.length,
      directSum,
      projectionSum,
      cartTotalPrice,
      unresolvedProductIds,
    },
  };
};

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

const normalizeMarketplaceStatus = (status) =>
  PROVIDER_TO_LOCAL_STATUS[String(status || "").toLowerCase()] || "processing";

const isLikelyObjectId = (value) => /^[a-f0-9]{24}$/i.test(String(value || "").trim());

const buildProviderLineIdentity = (item = {}, index = 0) => {
  const rawProductId = String(item?.productId || item?.id || "").trim();
  const listingId = String(item?.listingId || item?.parentGroupId || rawProductId || "").trim();
  const inferredLegacyVariantId = item?.parentGroupId && rawProductId && rawProductId !== item?.parentGroupId
    ? rawProductId
    : "";
  const variantId = String(item?.variantId || inferredLegacyVariantId || "").trim();
  const quantity = Number(item?.quantity || 0);

  return {
    lineId: String(item?.lineId || `line_${index + 1}`),
    listingId,
    variantId,
    productId: rawProductId,
    quantity,
  };
};

const resolveProviderLinesFromHoldItems = async (items = []) => {
  const lineIdentities = (Array.isArray(items) ? items : []).map((item, index) =>
    buildProviderLineIdentity(item, index)
  );

  const candidateIds = [...new Set(
    lineIdentities
      .flatMap((line) => [line.productId, line.listingId, line.variantId])
      .filter(Boolean)
  )];

  const cacheRows = candidateIds.length
    ? await MarketplaceProductCache.find({
        $or: [
          { providerProductId: { $in: candidateIds } },
          { sku: { $in: candidateIds } },
        ],
      })
        .select("providerProductId sku")
        .lean()
    : [];

  const byProviderId = new Map(
    cacheRows.map((row) => [String(row.providerProductId || "").trim(), String(row.providerProductId || "").trim()])
  );
  const bySku = new Map(
    cacheRows
      .filter((row) => row.sku)
      .map((row) => [String(row.sku).trim(), String(row.providerProductId || "").trim()])
  );

  const resolvedLines = [];
  const unresolved = [];

  for (const [index, item] of (Array.isArray(items) ? items : []).entries()) {
    const lineIdentity = buildProviderLineIdentity(item, index);
    const quantity = lineIdentity.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      continue;
    }

    const isGroupedLine = Boolean(lineIdentity.listingId && lineIdentity.variantId);

    if (isGroupedLine) {
      const resolvedListingId = byProviderId.get(lineIdentity.listingId) || bySku.get(lineIdentity.listingId) || lineIdentity.listingId;
      const resolvedVariantId = byProviderId.get(lineIdentity.variantId) || bySku.get(lineIdentity.variantId) || lineIdentity.variantId;

      if (!resolvedListingId || !resolvedVariantId) {
        unresolved.push({
          productId: lineIdentity.productId || null,
          listingId: lineIdentity.listingId || null,
          variantId: lineIdentity.variantId || null,
          productName: String(item?.productName || "").trim() || null,
          quantity,
        });
        continue;
      }

      resolvedLines.push({
        lineId: lineIdentity.lineId,
        listingId: String(resolvedListingId),
        variantId: String(resolvedVariantId),
        quantity,
      });
      continue;
    }

    const rawId = lineIdentity.productId;
    const providerProductId = byProviderId.get(rawId) || bySku.get(rawId) || rawId;

    if (!providerProductId) {
      unresolved.push({
        productId: rawId || null,
        productName: String(item?.productName || "").trim() || null,
        quantity,
      });
      continue;
    }

    resolvedLines.push({
      lineId: lineIdentity.lineId,
      productId: providerProductId,
      quantity,
    });
  }

  return {
    resolvedLines,
    unresolved,
  };
};

const normalizeOrderLineSnapshot = ({ providerLines = [], holdItems = [] } = {}) => {
  const holdItemByProductId = new Map(
    (Array.isArray(holdItems) ? holdItems : []).map((item) => [
      String(item?.listingId || item?.productId || ""),
      item,
    ])
  );

  return (Array.isArray(providerLines) ? providerLines : []).map((line) => {
    const productId = String(line?.listingId || line?.product || line?.productId || "");
    const holdItem = holdItemByProductId.get(productId);

    return {
      ...line,
      productId: line?.productId || holdItem?.productId || line?.product || null,
      listingId: line?.listingId || holdItem?.listingId || holdItem?.parentGroupId || line?.productId || line?.product || null,
      productName: line?.productName || line?.name || holdItem?.productName || "Item",
      variantId: line?.variantId || holdItem?.variantId || null,
      variantName: line?.variantName || holdItem?.variantName || null,
      parentGroupId: line?.parentGroupId || line?.groupId || holdItem?.parentGroupId || null,
      groupName: line?.groupName || holdItem?.groupName || null,
      lineImage:
        line?.variantImage
        || line?.variantImageUrl
        || line?.selectedImage
        || line?.image
        || holdItem?.selectedImage
        || holdItem?.image
        || "",
      decisionStatus: line?.decisionStatus || line?.status || null,
      decisionReason: line?.decisionReason || line?.reason || null,
    };
  });
};

const CHECKOUT_SHIPPING_FEE = 15;
const CHECKOUT_TAX_RATE = 0.08;

const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const computeCheckoutTotals = (subtotalAmount, options = {}) => {
  const isPickup = String(options.fulfillmentMethod || "").toLowerCase() === "pickup";
  const subtotal = toMoney(subtotalAmount);
  const shipping = subtotal > 0 && !isPickup ? CHECKOUT_SHIPPING_FEE : 0;
  const tax = toMoney(subtotal * CHECKOUT_TAX_RATE);
  const total = toMoney(subtotal + shipping + tax);

  return {
    subtotal,
    shipping,
    tax,
    total,
  };
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

const generateLegacyOrderNumber = () =>
  `MKT${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const resolveCheckoutCart = async ({ buyerId, sessionId }) => {
  const [userCart, sessionCart] = await Promise.all([
    buyerId ? Cart.findOne({ userId: buyerId }) : Promise.resolve(null),
    sessionId ? Cart.findOne({ sessionId }) : Promise.resolve(null),
  ]);

  const candidates = [userCart, sessionCart].filter(
    (cart) => cart && Array.isArray(cart.items) && cart.items.length > 0
  );

  if (!candidates.length) {
    return userCart || sessionCart || null;
  }

  const chosenCart = candidates.sort((left, right) => {
    const leftUpdated = new Date(left.updatedAt || 0).getTime();
    const rightUpdated = new Date(right.updatedAt || 0).getTime();
    return rightUpdated - leftUpdated;
  })[0];

  if (buyerId && !chosenCart.userId) {
    chosenCart.userId = buyerId;
    chosenCart.sessionId = null;
    await chosenCart.save();
  }

  return chosenCart;
};

const syncLegacyOrderFromMarketplace = async ({
  marketplaceOrder,
  hold,
  shippingAddress,
  buyerId,
  buyerEmail,
  buyerName,
}) => {
  if (!marketplaceOrder || !hold) {
    return null;
  }

  const orderStatus = toLegacyOrderStatus(marketplaceOrder.status);
  let legacyOrder = await Order.findOne({ paystackReference: hold.paymentReference });

  const orderPayload = {
    userId: buyerId || null,
    orderNumber: legacyOrder?.orderNumber || marketplaceOrder.providerOrderNumber || generateLegacyOrderNumber(),
    items: Array.isArray(hold.items)
      ? hold.items.map((item) => ({
          productId: item.productId,
          listingId: item.listingId || item.parentGroupId || item.productId || null,
          productName: item.productName,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
          parentGroupId: item.parentGroupId || null,
          groupName: item.groupName || null,
          price: toMonetaryNumber(item.unitPrice, 0),
          quantity: Number(item.quantity || 0),
          image: item.selectedImage || item.image || "",
          selectedImage: item.selectedImage || item.image || "",
        }))
      : [],
    customizations: [],
    totalAmount: toMonetaryNumber(hold.amount, 0),
    status: orderStatus,
    paymentMethod: "paystack",
    paymentReference: hold.paymentReference,
    paystackReference: hold.paymentReference,
    shippingAddress: shippingAddress || hold.shippingAddress || {},
  };

  if (!legacyOrder) {
    legacyOrder = await Order.create({
      ...orderPayload,
      notes: `marketplace:${marketplaceOrder.providerOrderId || "unknown"}`,
    });
  } else {
    legacyOrder.status = orderPayload.status;
    legacyOrder.totalAmount = orderPayload.totalAmount;
    legacyOrder.shippingAddress = orderPayload.shippingAddress;
    legacyOrder.items = orderPayload.items;
    legacyOrder.userId = orderPayload.userId || legacyOrder.userId;
    legacyOrder.paymentReference = orderPayload.paymentReference;
    legacyOrder.paystackReference = orderPayload.paystackReference;
    await legacyOrder.save();
  }

  if ((!legacyOrder.shippingAddress?.email || !legacyOrder.shippingAddress?.fullName) && (buyerEmail || buyerName)) {
    legacyOrder.shippingAddress = {
      ...legacyOrder.shippingAddress,
      email: legacyOrder.shippingAddress?.email || buyerEmail || "",
      fullName: legacyOrder.shippingAddress?.fullName || buyerName || "",
    };
    await legacyOrder.save();
  }

  return legacyOrder;
};

const finalizeMarketplaceCheckoutByReference = async ({
  reference,
  status,
  authenticatedBuyerId,
  authenticatedUser,
  shippingAddress,
  source = "checkout.verify",
}) => {
  if (!reference) {
    const error = new Error("Payment reference is required");
    error.statusCode = 400;
    throw error;
  }

  if (status && status !== "success") {
    const error = new Error("Only verify=success can trigger order creation");
    error.statusCode = 400;
    throw error;
  }

  const existingOrder = await MarketplaceOrder.findOne({ paymentReference: reference });
  if (existingOrder) {
    await recordMetric("marketplace.order.idempotent_hit", {
      buyerId: String(authenticatedBuyerId || existingOrder.buyerId || "unknown"),
      source,
    });

    const holdForExisting = await InventoryHold.findOne({ paymentReference: reference });
    if (holdForExisting) {
      await syncLegacyOrderFromMarketplace({
        marketplaceOrder: existingOrder,
        hold: holdForExisting,
        shippingAddress: shippingAddress || holdForExisting.shippingAddress,
        buyerId: authenticatedBuyerId || holdForExisting.buyerId,
        buyerEmail: authenticatedUser?.email,
        buyerName: authenticatedUser?.name,
      });
    }

    return {
      statusCode: 200,
      payload: {
        message: "Order already finalized",
        order: existingOrder,
        idempotent: true,
      },
    };
  }

  const holdQuery = { paymentReference: reference };
  if (authenticatedBuyerId) {
    holdQuery.buyerId = authenticatedBuyerId;
  }

  let hold = await InventoryHold.findOne(holdQuery);
  if (!hold && authenticatedBuyerId) {
    hold = await InventoryHold.findOne({ paymentReference: reference });
  }

  if (!hold) {
    const error = new Error("Matching hold not found");
    error.statusCode = 404;
    throw error;
  }

  const buyerId = authenticatedBuyerId || hold.buyerId;
  if (!buyerId) {
    const error = new Error("Unable to resolve buyer for checkout verification");
    error.statusCode = 400;
    throw error;
  }

  const resolvedShippingAddress =
    (shippingAddress && typeof shippingAddress === "object" && Object.keys(shippingAddress).length
      ? shippingAddress
      : hold.shippingAddress) || {};

  const verification = await verifyTransaction(reference);
  if (verification.status !== "success") {
    hold.paymentStatus = "failed";
    hold.auditTrail.push({
      action: "payment_verification_failed",
      occurredAt: new Date(),
      metadata: { reference, paystackStatus: verification.status, source },
    });
    await hold.save();

    await recordMetric("marketplace.payment.verify_failed", {
      buyerId: String(buyerId),
      source,
    });

    const error = new Error("Payment verification failed");
    error.statusCode = 400;
    error.details = { status: verification.status };
    throw error;
  }

  const verifiedMinorAmount = Number(verification.amount || 0);
  const holdMinorAmount = Math.round(toMonetaryNumber(hold.amount, 0) * 100);
  if (verifiedMinorAmount !== holdMinorAmount) {
    const error = new Error("Verified amount mismatch");
    error.statusCode = 409;
    error.details = {
      verifiedMinorAmount,
      holdMinorAmount,
    };
    throw error;
  }

  if (hold.status === "completed") {
    const completedOrder = await MarketplaceOrder.findOne({ holdId: hold.holdId });
    if (completedOrder) {
      await syncLegacyOrderFromMarketplace({
        marketplaceOrder: completedOrder,
        hold,
        shippingAddress: resolvedShippingAddress,
        buyerId,
        buyerEmail: authenticatedUser?.email,
        buyerName: authenticatedUser?.name,
      });

      return {
        statusCode: 200,
        payload: { message: "Order already finalized", order: completedOrder, idempotent: true },
      };
    }
  }

  let buyerEmail = authenticatedUser?.email || verification.customer?.email || resolvedShippingAddress?.email;
  let buyerName = authenticatedUser?.name || resolvedShippingAddress?.fullName;

  if (!buyerEmail || !buyerName) {
    const buyer = await User.findById(buyerId).select("name email").lean();
    buyerEmail = buyerEmail || buyer?.email || "";
    buyerName = buyerName || buyer?.name || "";
  }

  let createdProviderOrder;
  const providerLineResolution = await resolveProviderLinesFromHoldItems(hold.items || []);
  if (!providerLineResolution.resolvedLines.length || providerLineResolution.unresolved.length) {
    const error = new Error("Unable to map checkout items to valid marketplace listings");
    error.statusCode = 422;
    error.details = {
      unresolvedItems: providerLineResolution.unresolved,
    };
    throw error;
  }

  try {
    createdProviderOrder = await createProviderOrder({
      partnerOrderRef: hold.holdId,
      buyerId: String(buyerId),
      buyerEmail,
      buyerName,
      buyerPhone: resolvedShippingAddress?.phone,
      correlationId: hold.correlationId,
      idempotencyKey: hold.idempotencyKey,
      lines: providerLineResolution.resolvedLines,
      shippingAddress: resolvedShippingAddress,
      lineMetadata: hold.items,
    });
  } catch (error) {
    await recordMetric("marketplace.provider.order_create_failed", {
      buyerId: String(buyerId),
      source,
    });
    console.error("[marketplace:provider:create-order] failed", {
      source,
      buyerId: String(buyerId),
      holdId: hold.holdId,
      paymentReference: reference,
      correlationId: hold.correlationId,
      lineCount: providerLineResolution.resolvedLines.length,
      unresolvedLineCount: providerLineResolution.unresolved.length,
      message: error?.message,
      status: error?.status,
      details: error?.details || null,
    });
    const mappedError = new Error("Marketplace provider order creation failed");
    mappedError.statusCode = error?.status || 502;
    mappedError.details = error?.details || null;
    throw mappedError;
  }

  if (!createdProviderOrder?._id) {
    await recordMetric("marketplace.provider.order_create_failed", {
      buyerId: String(buyerId),
      source,
    });
    const error = new Error("Marketplace provider order creation failed");
    error.statusCode = 502;
    throw error;
  }

  let providerOrder = createdProviderOrder;
  try {
    const confirmedProviderOrder = await confirmProviderOrderPayment({
      providerOrderId: String(createdProviderOrder._id),
      paymentReference: reference,
      correlationId: hold.correlationId,
    });

    if (confirmedProviderOrder?._id) {
      providerOrder = confirmedProviderOrder;
    }
  } catch (error) {
    await recordMetric("marketplace.provider.payment_confirm_failed", {
      buyerId: String(buyerId),
      source,
    });
  }

  let order;
  try {
    order = await MarketplaceOrder.create({
      orderId: uuidv4(),
      providerOrderId: String(providerOrder._id),
      providerOrderNumber: providerOrder.orderNumber || null,
      buyerId,
      holdId: hold.holdId,
      paymentReference: reference,
      status: normalizeMarketplaceStatus(providerOrder.status || "payment_confirmed"),
      providerStatus: String(providerOrder.status || "payment_confirmed"),
      amount: hold.amount,
      currency: hold.currency,
      idempotencyKey: hold.idempotencyKey,
      correlationId: hold.correlationId,
      buyerSnapshot: {
        id: authenticatedUser?._id || buyerId,
        email: buyerEmail || "",
        name: buyerName || "",
      },
      shippingAddress: resolvedShippingAddress,
      lineSnapshot: normalizeOrderLineSnapshot({
        providerLines: providerOrder.lines,
        holdItems: hold.items,
      }),
      lineDecisions: normalizeOrderLineSnapshot({
        providerLines: providerOrder.lines,
        holdItems: hold.items,
      })
        .filter((line) => line.decisionStatus || line.decisionReason)
        .map((line) => ({
          lineId: line.lineId || line.id || null,
          productId: line.productId,
          decisionStatus: line.decisionStatus,
          decisionReason: line.decisionReason,
          occurredAt: new Date(),
        })),
      lastProviderSyncAt: new Date(),
      auditTrail: [
        {
          action: "order_created_from_verified_payment",
          occurredAt: new Date(),
          metadata: {
            reference,
            paystackStatus: verification.status,
            providerOrderId: String(providerOrder._id),
            providerOrderStatus: providerOrder.status,
            source,
          },
        },
      ],
    });
  } catch (error) {
    if (error?.code === 11000) {
      const idempotentOrder = await MarketplaceOrder.findOne({ paymentReference: reference });
      if (idempotentOrder) {
        await syncLegacyOrderFromMarketplace({
          marketplaceOrder: idempotentOrder,
          hold,
          shippingAddress: resolvedShippingAddress,
          buyerId,
          buyerEmail,
          buyerName,
        });

        return {
          statusCode: 200,
          payload: {
            message: "Order already finalized",
            order: idempotentOrder,
            idempotent: true,
          },
        };
      }
    }
    throw error;
  }

  hold.status = "completed";
  hold.paymentStatus = "verified";
  hold.shippingAddress = resolvedShippingAddress;
  hold.auditTrail.push({
    action: "payment_verified",
    occurredAt: new Date(),
    metadata: {
      reference,
      amount: verifiedMinorAmount / 100,
      source,
    },
  });
  await hold.save();

  await syncLegacyOrderFromMarketplace({
    marketplaceOrder: order,
    hold,
    shippingAddress: resolvedShippingAddress,
    buyerId,
    buyerEmail,
    buyerName,
  });

  await publishEvent({
    eventType: "marketplace.order.payment_confirmed",
    source: "marketplace.checkout",
    buyerId,
    correlationId: hold.correlationId,
    payload: {
      orderId: order.orderId,
      providerOrderId: order.providerOrderId,
      providerOrderNumber: order.providerOrderNumber,
      holdId: hold.holdId,
      paymentReference: reference,
      amount: order.amount,
      status: order.status,
      checkoutSource: source,
    },
  });

  await Cart.updateMany(
    {
      $or: [
        { userId: buyerId },
        ...(hold.sessionId ? [{ sessionId: hold.sessionId }] : []),
      ],
    },
    {
      $set: {
        items: [],
        customizations: [],
        totalItems: 0,
        totalPrice: 0,
      },
    }
  );

  await recordMetric("marketplace.order.created", {
    buyerId: String(buyerId),
    source,
  });

  return {
    statusCode: 201,
    payload: {
      message: "Order finalized",
      order,
    },
  };
};

const createPartnerSession = asyncHandler(async (req, res) => {
  const { clientId, clientSecret } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ message: "clientId and clientSecret are required" });
  }

  const session = await issuePartnerSession({
    clientId,
    clientSecret,
    origin: req.get("origin"),
  });

  await recordMetric("marketplace.auth.partner_session.created", {
    clientId,
  });

  res.status(200).json(session);
});

const getPublicInventory = asyncHandler(async (req, res) => {
  const projected = await getProjectedProducts();
  res.status(200).json({ data: projected });
});

const triggerInventorySync = asyncHandler(async (req, res) => {
  const result = await syncInventoryProjection({
    trigger: "internal-endpoint",
    correlationId: req.get("x-correlation-id") || uuidv4(),
  });

  res.status(200).json({
    message: "Inventory sync started",
    ...result,
  });
});

const getMarketplaceMetrics = asyncHandler(async (req, res) => {
  const keyPrefix = req.query.prefix;
  const metrics = await getMetrics({ keyPrefix });
  res.status(200).json({ data: metrics });
});

const getMarketplaceWebhookRegistrationHealth = asyncHandler(async (_req, res) => {
  const environment = process.env.NODE_ENV || "development";
  const config = getMarketplaceConfig();

  const endpoint = await MarketplaceWebhookEndpoint.findOne({
    provider: "provider",
    environment,
  })
    .select("provider environment providerEndpointId url isActive secretVersion registrationStatus lastRegisteredAt updatedAt")
    .lean();

  return res.status(200).json({
    data: {
      registrationEnabled: Boolean(config.providerWebhookRegistrationEnabled),
      webhooksEnabled: Boolean(config.webhooksEnabled),
      environment,
      targetWebhookUrl: config.providerWebhookPublicBaseUrl
        ? `${String(config.providerWebhookPublicBaseUrl).replace(/\/+$/g, "")}${config.providerWebhookInboundPath.startsWith("/") ? config.providerWebhookInboundPath : `/${config.providerWebhookInboundPath}`}`
        : null,
      endpoint: endpoint
        ? {
            provider: endpoint.provider,
            environment: endpoint.environment,
            providerEndpointId: endpoint.providerEndpointId || null,
            url: endpoint.url,
            isActive: endpoint.isActive,
            secretVersion: endpoint.secretVersion || 1,
            registrationStatus: endpoint.registrationStatus,
            lastRegisteredAt: endpoint.lastRegisteredAt || null,
            updatedAt: endpoint.updatedAt || null,
            hasStoredSecret: Boolean(endpoint.secretVersion),
          }
        : null,
    },
  });
});

const initializeMarketplaceCheckout = asyncHandler(async (req, res) => {
  const buyerId = req.user?._id || req.user?.id;
  const sessionId = String(req.body?.sessionId || "").trim() || null;
  const idempotencyKey = req.get("x-idempotency-key");
  const correlationId = req.get("x-correlation-id") || uuidv4();

  if (!buyerId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (!idempotencyKey) {
    return res.status(400).json({ message: "x-idempotency-key is required" });
  }

  const cart = await resolveCheckoutCart({ buyerId, sessionId });
  if (!cart || !cart.items.length) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  const buyerActionKey = buildBuyerActionKey({
    buyerId: String(buyerId),
    action: "checkout-initialize",
    scope: String(cart._id),
  });

  const reserve = await reserveIdempotency({
    key: idempotencyKey,
    clientId: `buyer:${buyerId}`,
    buyerActionKey,
    payload: {
      cartId: String(cart._id),
      itemCount: cart.items.length,
    },
  });

  if (!reserve.created && reserve.record.status === "succeeded") {
    return res.status(200).json(reserve.record.responsePayload);
  }

  if (!reserve.created && reserve.record.status === "processing") {
    return res.status(202).json({ message: "Checkout initialization in progress" });
  }

  try {
    const holdId = uuidv4();
    const resolved = await resolveCartAmount(cart);
    const subtotalAmount = toMonetaryNumber(resolved.amount, 0);
    const shippingAddress = req.body?.shippingAddress && typeof req.body.shippingAddress === "object"
      ? req.body.shippingAddress
      : {};
    const totals = computeCheckoutTotals(subtotalAmount, {
      fulfillmentMethod: shippingAddress.fulfillmentMethod,
    });
    const holdAmount = totals.total;

    console.log("[marketplace:checkout-initialize] initializing checkout", {
      buyerId: String(buyerId), 
      holdAmount,
      totals,
      diagnostics: resolved.diagnostics,
    });

    if (!Number.isFinite(holdAmount) || holdAmount <= 0) {
      throw new Error("Checkout amount is invalid");
    }

    const providerLineResolution = await resolveProviderLinesFromHoldItems(mapCartItemsToProvider(cart.items));
    if (!providerLineResolution.resolvedLines.length || providerLineResolution.unresolved.length) {
      return res.status(409).json({
        message: "Some cart items are not valid marketplace listings. Refresh products and try again.",
        details: {
          unresolvedItems: providerLineResolution.unresolved,
        },
      });
    }

    const holdExpiresAt = new Date(Date.now() + 45 * 60 * 1000);

    const payment = await initializeRedirectTransaction({
      amount: holdAmount,
      email: req.user.email,
      metadata: {
        buyerId: String(buyerId),
        holdId,
        idempotencyKey,
        correlationId,
      },
    });

    console.info("[marketplace:checkout-initialize] paystack initialized", {
      buyerId: String(buyerId),
      correlationId,
      idempotencyKey,
      reference: payment?.reference,
      hasAuthorizationUrl: Boolean(payment?.authorization_url),
    });

    await InventoryHold.create({
      holdId,
      providerHoldId: null,
      buyerId,
      status: "active",
      amount: holdAmount,
      currency: "NGN",
      pricingBreakdown: {
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        tax: totals.tax,
      },
      sessionId,
      items: cart.items.map((item) => ({
        productId: String(item.productId),
        listingId: String(item.listingId || item.parentGroupId || item.productId),
        productName: item.productName,
        variantId: item.variantId || null,
        variantName: item.variantName || null,
        parentGroupId: item.parentGroupId || null,
        groupName: item.groupName || null,
        quantity: item.quantity,
        unitPrice: toMonetaryNumber(item.price, 0),
        image: item.image || "",
        selectedImage: item.selectedImage || item.image || "",
      })),
      shippingAddress,
      idempotencyKey,
      correlationId,
      paymentReference: payment.reference,
      paystackAccessCode: payment.access_code,
      paymentStatus: "initialized",
      expiresAt: holdExpiresAt,
      auditTrail: [
        {
          action: "checkout_initialized",
          occurredAt: new Date(),
          metadata: {
            paymentReference: payment.reference,
          },
        },
      ],
    });

    const responsePayload = {
      authorizationUrl: payment.authorization_url,
      reference: payment.reference,
      holdId,
      correlationId,
      idempotencyKey,
      amountBreakdown: {
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        tax: totals.tax,
        total: totals.total,
      },
      expiresAt: holdExpiresAt.toISOString(),
    };

    await markIdempotencySuccess({
      id: reserve.record._id,
      responsePayload,
    });

    await recordMetric("marketplace.hold.created", {
      buyerId: String(buyerId),
    });

    await publishEvent({
      eventType: "marketplace.hold.created",
      source: "marketplace.checkout",
      correlationId,
      buyerId,
      payload: {
        holdId,
        reference: payment.reference,
        amount: holdAmount,
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        tax: totals.tax,
        lineCount: providerLineResolution.resolvedLines.length,
      },
    });

    res.status(200).json(responsePayload);
  } catch (error) {
    console.error("[marketplace:checkout-initialize] failed", {
      buyerId: String(buyerId),
      correlationId,
      idempotencyKey,
      message: error?.message,
      statusCode: error?.statusCode,
      details: error?.details || null,
      stack: error?.stack,
    });

    await markIdempotencyFailure({
      id: reserve.record._id,
      errorPayload: { message: error.message || "Checkout initialization failed" },
    });
    await recordMetric("marketplace.hold.create_failed", {
      buyerId: String(buyerId),
    });
    throw error;
  }
});

const verifyAndFinalizeMarketplaceCheckout = asyncHandler(async (req, res) => {
  const authenticatedBuyerId = req.user?._id || req.user?.id;
  const { reference, status, shippingAddress } = req.body;

  try {
    const result = await finalizeMarketplaceCheckoutByReference({
      reference,
      status,
      authenticatedBuyerId,
      authenticatedUser: req.user,
      shippingAddress,
      source: "checkout.verify",
    });

    return res.status(result.statusCode).json(result.payload);
  } catch (error) {
    console.error("[marketplace:checkout:verify] failed", {
      reference,
      status,
      buyerId: String(authenticatedBuyerId || ""),
      message: error?.message,
      statusCode: error?.statusCode || 500,
      details: error?.details || null,
      stack: error?.stack,
    });
    return res.status(error.statusCode || 500).json({
      message: error.message || "Checkout verification failed",
      details: error.details || null,
    });
  }
});

const toTrackingOrder = (order) => ({
  orderNumber: order.providerOrderNumber || order.orderId,
  providerOrderId: order.providerOrderId,
  paymentReference: order.paymentReference,
  status: order.status,
  totalAmount: order.amount,
  currency: order.currency,
  items: Array.isArray(order.lineSnapshot)
    ? order.lineSnapshot.map((line) => ({
        productId: line.product || line.productId,
        productName: line.name || line.productName || "Item",
        quantity: Number(line.acceptedQty || line.requestedQty || 0),
        price: Number(line.effectiveUnitPrice || line.unitPrice || 0),
        image: line.lineImage || line.image || "",
        selectedImage: line.lineImage || line.image || "",
        variantId: line.variantId || null,
        variantName: line.variantName || null,
        parentGroupId: line.parentGroupId || null,
        groupName: line.groupName || null,
        decisionStatus: line.decisionStatus || null,
        decisionReason: line.decisionReason || null,
      }))
    : [],
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  timeline: Array.isArray(order.auditTrail)
    ? order.auditTrail.map((entry) => ({
        action: entry.action,
        occurredAt: entry.occurredAt,
        metadata: entry.metadata || {},
      }))
    : [],
});

const getBuyerMarketplaceOrders = asyncHandler(async (req, res) => {
  const buyerId = req.user?._id || req.user?.id;
  if (!buyerId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const orders = await MarketplaceOrder.find({ buyerId }).sort({ createdAt: -1 }).lean();
  return res.status(200).json({
    data: orders.map(toTrackingOrder),
  });
});

const trackBuyerMarketplaceOrder = asyncHandler(async (req, res) => {
  const buyerId = req.user?._id || req.user?.id;
  const orderNumber = String(req.body?.orderNumber || "").trim();

  if (!buyerId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (!orderNumber) {
    return res.status(400).json({ message: "orderNumber is required" });
  }

  const order = await MarketplaceOrder.findOne({
    buyerId,
    $or: [
      { orderId: orderNumber },
      { providerOrderNumber: orderNumber },
      { providerOrderId: orderNumber },
      { paymentReference: orderNumber },
    ],
  }).lean();

  if (!order) {
    return res.status(404).json({ message: "Marketplace order not found" });
  }

  return res.status(200).json(toTrackingOrder(order));
});

const getMarketplaceEventSync = asyncHandler(async (req, res) => {
  const buyerId = req.user?._id || req.user?.id;
  const since = req.query.since;

  if (!buyerId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const query = { buyerId };
  if (since) {
    query.occurredAt = { $gt: new Date(since) };
  }

  const events = await BusinessEvent.find(query)
    .sort({ occurredAt: 1 })
    .limit(200)
    .lean();

  res.status(200).json({
    data: events.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      source: event.source,
      correlationId: event.correlationId,
      payloadVersion: event.payloadVersion,
      payload: event.payload,
    })),
  });
});

module.exports = {
  createPartnerSession,
  getPublicInventory,
  triggerInventorySync,
  initializeMarketplaceCheckout,
  finalizeMarketplaceCheckoutByReference,
  verifyAndFinalizeMarketplaceCheckout,
  getBuyerMarketplaceOrders,
  trackBuyerMarketplaceOrder,
  getMarketplaceEventSync,
  getMarketplaceMetrics,
  getMarketplaceWebhookRegistrationHealth,
  __testables: {
    mapCartItemsToProvider,
    buildProviderLineIdentity,
    resolveProviderLinesFromHoldItems,
  },
};
