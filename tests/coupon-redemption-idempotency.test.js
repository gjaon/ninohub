const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const Coupon = require("../models/couponModel");
const {
  __testables: { redeemCouponFromHold },
} = require("../controllers/marketplaceController");

test.before(async () => {
  await connectTestDb();
  await Coupon.syncIndexes();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("coupon is redeemed once and duplicate redemption is idempotent for same reference", async () => {
  const buyerId = new mongoose.Types.ObjectId();

  await Coupon.create({
    code: "REDEEM-ONCE",
    discountType: "amount",
    discountValue: 1000,
    status: "active",
    assignedToType: "manual",
    createdByAdminEmail: "admin@example.com",
  });

  const hold = {
    coupon: {
      code: "REDEEM-ONCE",
    },
  };

  const first = await redeemCouponFromHold({
    hold,
    order: { orderId: "order-1" },
    reference: "ref-1",
    buyerId,
    correlationId: "corr-1",
  });

  assert.equal(first.redeemed, true);

  const second = await redeemCouponFromHold({
    hold,
    order: { orderId: "order-1" },
    reference: "ref-1",
    buyerId,
    correlationId: "corr-1",
  });

  assert.equal(second.redeemed, true);
  assert.equal(second.idempotent, true);
});

test("redemption fails safely when coupon already redeemed by another reference", async () => {
  const buyerId = new mongoose.Types.ObjectId();

  await Coupon.create({
    code: "REDEEM-CONFLICT",
    discountType: "amount",
    discountValue: 1000,
    status: "redeemed",
    assignedToType: "manual",
    createdByAdminEmail: "admin@example.com",
    redemption: {
      redeemedAt: new Date(),
      redeemedByUserId: buyerId,
      paymentReference: "different-ref",
      orderId: "old-order",
    },
  });

  const hold = {
    coupon: {
      code: "REDEEM-CONFLICT",
    },
  };

  await assert.rejects(
    () =>
      redeemCouponFromHold({
        hold,
        order: { orderId: "order-2" },
        reference: "new-ref",
        buyerId,
        correlationId: "corr-2",
      }),
    /conflict/
  );
});
