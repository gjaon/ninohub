const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const Coupon = require("../models/couponModel");
const Waitlist = require("../models/waitlistModel");
const {
  validateCouponForCheckout,
} = require("../services/marketplace/couponService");
const {
  __testables: { computeCheckoutTotals },
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

test("valid amount coupon applies correctly for initialize pricing", async () => {
  const buyerId = new mongoose.Types.ObjectId();
  await Coupon.create({
    code: "AMOUNT-2000",
    discountType: "amount",
    discountValue: 2000,
    status: "active",
    assignedToType: "manual",
    createdByAdminEmail: "admin@example.com",
  });

  const coupon = await validateCouponForCheckout({
    couponCode: "amount-2000",
    buyerId,
    shippingAddress: { email: "buyer@example.com", phone: "+2348011111111", fulfillmentMethod: "delivery" },
    subtotal: 10000,
  });

  const totals = computeCheckoutTotals(10000, {
    fulfillmentMethod: "delivery",
    discountAmount: coupon.appliedDiscount,
  });

  assert.equal(coupon.appliedDiscount, 2000);
  assert.equal(totals.subtotal, 10000);
  assert.equal(totals.discount, 2000);
  assert.equal(totals.discountedSubtotal, 8000);
});

test("valid percentage coupon applies correctly for initialize pricing", async () => {
  const buyerId = new mongoose.Types.ObjectId();
  await Coupon.create({
    code: "PERCENT-10",
    discountType: "percentage",
    discountValue: 10,
    status: "active",
    assignedToType: "manual",
    createdByAdminEmail: "admin@example.com",
  });

  const coupon = await validateCouponForCheckout({
    couponCode: "PERCENT-10",
    buyerId,
    shippingAddress: { email: "buyer@example.com", phone: "+2348011111111", fulfillmentMethod: "delivery" },
    subtotal: 10000,
  });

  const totals = computeCheckoutTotals(10000, {
    fulfillmentMethod: "delivery",
    discountAmount: coupon.appliedDiscount,
  });

  assert.equal(coupon.appliedDiscount, 1000);
  assert.equal(totals.discount, 1000);
  assert.equal(totals.discountedSubtotal, 9000);
});

test("invalid or expired or redeemed coupons are rejected", async () => {
  const buyerId = new mongoose.Types.ObjectId();

  await Coupon.create({
    code: "EXPIRED-1",
    discountType: "amount",
    discountValue: 500,
    status: "active",
    assignedToType: "manual",
    expiresAt: new Date(Date.now() - 60 * 1000),
    createdByAdminEmail: "admin@example.com",
  });

  await Coupon.create({
    code: "REDEEMED-1",
    discountType: "amount",
    discountValue: 500,
    status: "redeemed",
    assignedToType: "manual",
    createdByAdminEmail: "admin@example.com",
  });

  await assert.rejects(
    () =>
      validateCouponForCheckout({
        couponCode: "NOT-EXIST",
        buyerId,
        shippingAddress: { email: "buyer@example.com", phone: "+2348011111111" },
        subtotal: 1000,
      }),
    /invalid/
  );

  await assert.rejects(
    () =>
      validateCouponForCheckout({
        couponCode: "EXPIRED-1",
        buyerId,
        shippingAddress: { email: "buyer@example.com", phone: "+2348011111111" },
        subtotal: 1000,
      }),
    /expired/
  );

  await assert.rejects(
    () =>
      validateCouponForCheckout({
        couponCode: "REDEEMED-1",
        buyerId,
        shippingAddress: { email: "buyer@example.com", phone: "+2348011111111" },
        subtotal: 1000,
      }),
    /no longer active/
  );
});

test("waitlist assigned coupon validates matching waitlist identity", async () => {
  const buyerId = new mongoose.Types.ObjectId();
  const waitlist = await Waitlist.create({
    name: "Wait User",
    email: "wait@example.com",
    phone: "+2348099999999",
  });

  await Coupon.create({
    code: "WAIT-ONLY-1",
    discountType: "amount",
    discountValue: 1500,
    status: "active",
    assignedToType: "waitlist",
    assignedToRef: waitlist._id,
    assignedEmail: waitlist.email,
    assignedPhone: waitlist.phone,
    createdByAdminEmail: "admin@example.com",
  });

  const valid = await validateCouponForCheckout({
    couponCode: "WAIT-ONLY-1",
    buyerId,
    shippingAddress: { email: "wait@example.com", phone: "+2348099999999" },
    subtotal: 3000,
  });

  assert.equal(valid.code, "WAIT-ONLY-1");

  await assert.rejects(
    () =>
      validateCouponForCheckout({
        couponCode: "WAIT-ONLY-1",
        buyerId,
        shippingAddress: { email: "other@example.com", phone: "+2348000000000" },
        subtotal: 3000,
      }),
    /not eligible/
  );
});
