const test = require("node:test");
const assert = require("node:assert/strict");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const User = require("../models/userModel");
const AdminCampaign = require("../models/adminCampaignModel");
const CampaignDeliveryLog = require("../models/campaignDeliveryLogModel");
const { sendCampaign } = require("../controllers/adminController");

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
  await AdminCampaign.syncIndexes();
  await CampaignDeliveryLog.syncIndexes();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("campaign send logs failures when provider configuration is missing", async () => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;

  await User.create({
    name: "Recipient User",
    email: "recipient@example.com",
    password: "password123",
  });

  const req = {
    user: { email: "admin@ninohub.com" },
    body: {
      name: "Launch campaign",
      channels: ["email"],
      audience: {
        scope: "users",
      },
      template: {
        subject: "Hello {{firstName}}",
        emailBody: "<p>Hello {{name}}</p>",
      },
    },
  };

  const res = createRes();

  await sendCampaign(req, res);

  assert.equal(res.statusCode, 201);

  const campaign = await AdminCampaign.findOne({ campaignId: res.body.campaign.campaignId }).lean();
  assert.ok(campaign);
  assert.equal(campaign.totals.recipients, 1);
  assert.equal(campaign.totals.failed, 1);

  const logs = await CampaignDeliveryLog.find({ campaignId: campaign.campaignId }).lean();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, "failed");
  assert.equal(logs[0].channel, "email");
});
