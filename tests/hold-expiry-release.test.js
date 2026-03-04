const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

process.env.MARKETPLACE_SECRET_ENCRYPTION_KEY = "test-encryption-key";

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const InventoryHold = require("../models/inventoryHoldModel");
const { releaseExpiredHolds } = require("../services/marketplace/holdService");

test.before(async () => {
  await connectTestDb();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("expires and releases active holds when expiry has passed", async () => {
  const buyerId = new mongoose.Types.ObjectId();

  await InventoryHold.create({
    holdId: "hold-expired-1",
    buyerId,
    status: "active",
    amount: 500,
    items: [{ productId: "p1", productName: "Ring", quantity: 1, unitPrice: 500 }],
    idempotencyKey: "idem-expired",
    correlationId: "corr-expired",
    expiresAt: new Date(Date.now() - 1000),
    auditTrail: [],
  });

  const count = await releaseExpiredHolds();
  const hold = await InventoryHold.findOne({ holdId: "hold-expired-1" });

  assert.equal(count, 1);
  assert.equal(hold.status, "expired");
  assert.equal(
    hold.auditTrail.some((entry) => entry.action === "hold_expired_released"),
    true
  );
});
