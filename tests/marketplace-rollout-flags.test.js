const test = require("node:test");
const assert = require("node:assert/strict");

const configPath = "../config/marketplaceConfig";

const trackedEnv = [
  "MARKETPLACE_CART_FAST_ACK_ENABLED",
  "MARKETPLACE_INVENTORY_BROADCAST_COALESCING_ENABLED",
  "MARKETPLACE_SOCKET_STALE_REFRESH_THROTTLE_ENABLED",
  "PAYSTACK_MODE",
  "MARKETPLACE_PUBLIC_API_ENABLED",
  "MARKETPLACE_WEBHOOKS_ENABLED",
  "MARKETPLACE_INTERNAL_UI_ENABLED",
];

let originalEnv = {};

test.beforeEach(() => {
  originalEnv = Object.fromEntries(trackedEnv.map((key) => [key, process.env[key]]));
  process.env.PAYSTACK_MODE = "test";
  delete process.env.MARKETPLACE_PUBLIC_API_ENABLED;
  delete process.env.MARKETPLACE_WEBHOOKS_ENABLED;
  delete process.env.MARKETPLACE_INTERNAL_UI_ENABLED;
  delete require.cache[require.resolve(configPath)];
});

test.afterEach(() => {
  trackedEnv.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  });
  delete require.cache[require.resolve(configPath)];
});

test("rollout flags default to enabled for fast cart ack and sync protections", () => {
  const { getMarketplaceConfig } = require(configPath);
  const config = getMarketplaceConfig();

  assert.equal(config.cartFastAckEnabled, true);
  assert.equal(config.inventoryBroadcastCoalescingEnabled, true);
  assert.equal(config.socketStaleRefreshThrottleEnabled, true);
});

test("rollout flags can be disabled via env", () => {
  process.env.MARKETPLACE_CART_FAST_ACK_ENABLED = "false";
  process.env.MARKETPLACE_INVENTORY_BROADCAST_COALESCING_ENABLED = "false";
  process.env.MARKETPLACE_SOCKET_STALE_REFRESH_THROTTLE_ENABLED = "false";

  delete require.cache[require.resolve(configPath)];
  const { getMarketplaceConfig } = require(configPath);
  const config = getMarketplaceConfig();

  assert.equal(config.cartFastAckEnabled, false);
  assert.equal(config.inventoryBroadcastCoalescingEnabled, false);
  assert.equal(config.socketStaleRefreshThrottleEnabled, false);
});
