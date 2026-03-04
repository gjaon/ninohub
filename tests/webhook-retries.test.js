const test = require("node:test");
const assert = require("node:assert/strict");

process.env.MARKETPLACE_WEBHOOK_RETRY_MAX_ATTEMPTS = "2";

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const {
  recordInboundDelivery,
  markProcessing,
  markRetryOrExhausted,
} = require("../services/marketplace/webhookDeliveryService");

test.before(async () => {
  await connectTestDb();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("moves webhook delivery from retrying to exhausted after max attempts", async () => {
  const recorded = await recordInboundDelivery({
    provider: "paystack",
    eventId: "evt-1",
    reference: "ref-1",
    signatureVerified: true,
    payload: { event: "charge.success" },
  });

  await markProcessing(recorded.delivery.deliveryId);
  const retrying = await markRetryOrExhausted({
    deliveryId: recorded.delivery.deliveryId,
    errorMessage: "temporary failure",
  });

  await markProcessing(recorded.delivery.deliveryId);
  const exhausted = await markRetryOrExhausted({
    deliveryId: recorded.delivery.deliveryId,
    errorMessage: "still failing",
  });

  assert.equal(retrying.status, "retrying");
  assert.equal(exhausted.status, "exhausted");
  assert.equal(exhausted.attempts, 2);
});
