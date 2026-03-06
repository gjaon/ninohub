const test = require("node:test");
const assert = require("node:assert/strict");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const User = require("../models/userModel");
const Waitlist = require("../models/waitlistModel");
const Coupon = require("../models/couponModel");
const {
  generateWaitlistCoupons,
  generateUserCoupons,
} = require("../controllers/adminController");

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return res;
};

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

test("bulk generation for waitlist works", async () => {
  await Waitlist.create([
    { name: "W1", email: "w1@example.com", phone: "+2348011111111", status: "pending" },
    { name: "W2", email: "w2@example.com", phone: "+2348022222222", status: "pending" },
  ]);

  const req = {
    user: { email: "admin@ninohub.com" },
    body: {
      status: "pending",
      discountType: "amount",
      discountValue: 2000,
      dryRun: false,
    },
  };
  const res = createRes();

  await generateWaitlistCoupons(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.summary.generated, 2);

  const count = await Coupon.countDocuments({ assignedToType: "waitlist" });
  assert.equal(count, 2);
});

test("generation for users works", async () => {
  await User.create([
    {
      name: "U1",
      email: "u1@example.com",
      password: "password123",
      phone: "+2348033333333",
    },
    {
      name: "U2",
      email: "u2@example.com",
      password: "password123",
      phone: "+2348044444444",
    },
  ]);

  const req = {
    user: { email: "admin@ninohub.com" },
    body: {
      segment: "with_phone",
      discountType: "percentage",
      discountValue: 10,
      dryRun: false,
    },
  };
  const res = createRes();

  await generateUserCoupons(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.summary.generated, 2);

  const count = await Coupon.countDocuments({ assignedToType: "user" });
  assert.equal(count, 2);
});
