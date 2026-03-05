const test = require("node:test");
const assert = require("node:assert/strict");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const CheckoutFallback = require("../models/checkoutFallbackModel");
const {
  acquireRetryLock,
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

test("acquireRetryLock is concurrency-safe and idempotent for active retry", async () => {
  await CheckoutFallback.create({
    fallbackId: "fb-retry-1",
    holdId: "hold-retry-1",
    paymentReference: "ref-retry-1",
    status: "pending",
    buyer: { id: "buyer-1", email: "buyer@example.com" },
    payment: { reference: "ref-retry-1", status: "success", amount: 10 },
    retryMeta: {
      count: 0,
      inFlight: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
    },
  });

  const first = await acquireRetryLock({ fallbackId: "fb-retry-1", actorEmail: "admin@example.com" });
  const second = await acquireRetryLock({ fallbackId: "fb-retry-1", actorEmail: "admin@example.com" });

  assert.ok(first);
  assert.equal(first.status, "retrying");
  assert.equal(first.retryMeta.inFlight, true);
  assert.equal(first.retryMeta.count, 1);
  assert.equal(second, null);
});
