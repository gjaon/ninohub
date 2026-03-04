const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const mongoose = require("mongoose");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");

const MarketplaceOrder = require("../models/marketplaceOrderModel");
const {
  ingestProviderWebhook,
  processProviderDelivery,
} = require("../controllers/webhookController");
const { recordInboundDelivery } = require("../services/marketplace/webhookDeliveryService");

process.env.MARKETPLACE_PROVIDER_WEBHOOK_SECRET = "test-webhook-secret";

const createMockRes = () => {
  const response = {
    statusCode: 200,
    body: null,
  };

  response.status = (code) => {
    response.statusCode = code;
    return response;
  };

  response.json = (payload) => {
    response.body = payload;
    return response;
  };

  return response;
};

const waitFor = async (predicate, timeoutMs = 1000, intervalMs = 50) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
};

test.before(async () => {
  await connectTestDb();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("applies SellSquare marketplace order event to local status model", async () => {
  const buyerId = new mongoose.Types.ObjectId();

  const order = await MarketplaceOrder.create({
    orderId: "ord-local-1",
    providerOrderId: "provider-order-1",
    providerOrderNumber: "MKT-ABC-123456",
    buyerId,
    holdId: "hold-1",
    paymentReference: "ref-1",
    status: "payment_confirmed",
    providerStatus: "payment_confirmed",
    amount: 5000,
    currency: "NGN",
    idempotencyKey: "idem-1",
    correlationId: "corr-1",
  });

  const payload = {
    id: "evt-provider-1",
    type: "marketplace.order.shipped",
    timestamp: Date.now(),
    data: {
      orderId: order.providerOrderId,
      status: "shipped",
    },
    metadata: {
      businessId: "biz-1",
    },
  };

  const recorded = await recordInboundDelivery({
    provider: "provider",
    eventId: payload.id,
    reference: payload.data.orderId,
    signatureVerified: true,
    payload,
  });

  await processProviderDelivery(recorded.delivery);

  const updated = await waitFor(async () => {
    const refreshed = await MarketplaceOrder.findById(order._id).lean();
    return refreshed?.status === "shipped" ? refreshed : null;
  });
  assert.ok(updated);
  assert.equal(updated.status, "shipped");
  assert.equal(updated.providerStatus, "shipped");
  assert.equal(updated.providerLastEventId, payload.id);
});

test("rejects tampered marketplace webhook signature", async () => {
  const payload = {
    id: "evt-provider-2",
    type: "marketplace.order.processing",
    timestamp: Date.now(),
    data: {
      orderId: "provider-order-missing",
      status: "processing",
    },
  };

  const req = {
    body: payload,
    rawBody: Buffer.from(JSON.stringify(payload)),
    get: (header) => {
      const map = {
        "x-marketplace-signature": "invalid-signature",
      };
      return map[String(header || "").toLowerCase()] || "";
    },
  };
  const res = createMockRes();

  await ingestProviderWebhook(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.message, "Invalid webhook signature");
});
