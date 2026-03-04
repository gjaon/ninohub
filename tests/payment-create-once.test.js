const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const MarketplaceOrder = require("../models/marketplaceOrderModel");

test.before(async () => {
  await connectTestDb();
  await MarketplaceOrder.syncIndexes();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("creates order once per payment reference", async () => {
  const buyerId = new mongoose.Types.ObjectId();

  await MarketplaceOrder.create({
    orderId: "ord-1",
    buyerId,
    holdId: "hold-1",
    paymentReference: "ref-abc",
    amount: 1000,
    currency: "NGN",
    idempotencyKey: "idem-1",
    correlationId: "corr-1",
  });

  await assert.rejects(
    () =>
      MarketplaceOrder.create({
        orderId: "ord-2",
        buyerId,
        holdId: "hold-2",
        paymentReference: "ref-abc",
        amount: 1000,
        currency: "NGN",
        idempotencyKey: "idem-2",
        correlationId: "corr-2",
      }),
    /duplicate key/
  );
});
