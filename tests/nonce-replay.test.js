const test = require("node:test");
const assert = require("node:assert/strict");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const { claimNonce } = require("../services/marketplace/nonceService");

test.before(async () => {
  await connectTestDb();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("accepts nonce first use and rejects replay", async () => {
  await claimNonce({
    nonce: "nonce-1",
    clientId: "partner-A",
    requestFingerprint: "POST:/api/marketplace/public/inventory:{}",
  });

  await assert.rejects(
    () =>
      claimNonce({
        nonce: "nonce-1",
        clientId: "partner-A",
        requestFingerprint: "POST:/api/marketplace/public/inventory:{}",
      }),
    /Nonce replay detected/
  );
});
