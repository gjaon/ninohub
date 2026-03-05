const test = require("node:test");
const assert = require("node:assert/strict");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const CheckoutFallback = require("../models/checkoutFallbackModel");
const {
  createOrUpdateFallback,
} = require("../services/marketplace/checkoutFallbackService");

test.before(async () => {
  await connectTestDb();
  await CheckoutFallback.syncIndexes();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("creates fallback record when payment verified but provider submission fails", async () => {
  const hold = {
    holdId: "hold-verified-1",
    status: "active",
    paymentStatus: "verified",
    amount: 25000,
    currency: "NGN",
    pricingBreakdown: { subtotal: 24000, shipping: 1000, tax: 0 },
    expiresAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    correlationId: "corr-verified-1",
    idempotencyKey: "idem-verified-1",
    items: [{ productId: "prod-1", quantity: 1, unitPrice: 25000 }],
  };

  const fallback = await createOrUpdateFallback({
    hold,
    paymentReference: "payref-verified-1",
    buyer: {
      id: "buyer-1",
      email: "buyer@example.com",
      name: "Buyer One",
      phone: "+2348000000000",
    },
    payment: {
      reference: "payref-verified-1",
      status: "success",
      amount: 25000,
      amountMinor: 2500000,
      currency: "NGN",
    },
    shippingAddress: { fullName: "Buyer One", city: "Lagos" },
    lineItems: hold.items,
    orderIntentSnapshot: {
      providerLines: [],
      unresolvedItems: [{ productId: "prod-1" }],
    },
    providerError: {
      message: "Marketplace provider order creation failed",
      statusCode: 502,
    },
  });

  assert.equal(fallback.status, "pending");
  assert.equal(fallback.paymentReference, "payref-verified-1");
  assert.equal(fallback.payment.status, "success");
  assert.equal(fallback.providerError.statusCode, 502);
  assert.equal(Array.isArray(fallback.history), true);
  assert.equal(fallback.history.length >= 1, true);
});
