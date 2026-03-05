const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../middleware/adminMiddleware");

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

test("requireAdmin denies non-allowlisted users", async () => {
  process.env.ADMIN_EMAIL_ALLOWLIST = "admin@ninohub.com";

  const req = {
    user: {
      email: "buyer@ninohub.com",
    },
  };
  const res = createRes();
  let called = false;

  await requireAdmin(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "Admin access required");
});

test("requireAdmin allows allowlisted users", async () => {
  process.env.ADMIN_EMAIL_ALLOWLIST = "admin@ninohub.com";

  const req = {
    user: {
      email: "admin@ninohub.com",
    },
  };
  const res = createRes();
  let called = false;

  await requireAdmin(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});
