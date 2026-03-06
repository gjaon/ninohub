const test = require("node:test");
const assert = require("node:assert/strict");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const Coupon = require("../models/couponModel");

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

test("coupon code remains unique", async () => {
  await Coupon.create({
    code: "WELCOME-1",
    discountType: "amount",
    discountValue: 1000,
    createdByAdminEmail: "admin@example.com",
  });

  await assert.rejects(
    () =>
      Coupon.create({
        code: "WELCOME-1",
        discountType: "amount",
        discountValue: 1000,
        createdByAdminEmail: "admin@example.com",
      }),
    /duplicate key/
  );
});

test("coupon discount fields enforce valid type and value", async () => {
  await assert.rejects(
    () =>
      Coupon.create({
        code: "BAD-TYPE",
        discountType: "bonus",
        discountValue: 1000,
        createdByAdminEmail: "admin@example.com",
      }),
    /`bonus` is not a valid enum value/
  );

  await assert.rejects(
    () =>
      Coupon.create({
        code: "BAD-VALUE",
        discountType: "amount",
        discountValue: 0,
        createdByAdminEmail: "admin@example.com",
      }),
    /less than minimum allowed value/
  );
});
