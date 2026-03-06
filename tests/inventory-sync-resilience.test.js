const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const inventoryProjectionServicePath = "../services/marketplace/inventoryProjectionService";
const providerClientPath = "../services/marketplace/providerClient";
const marketplaceConfigPath = "../config/marketplaceConfig";
const businessEventBusPath = "../services/marketplace/businessEventBus";
const metricsServicePath = "../services/marketplace/metricsService";
const marketplaceProductCachePath = "../models/marketplaceProductCacheModel";

const trackedEnvKeys = [
  "NODE_ENV",
  "MARKETPLACE_INTEGRATION_BASE_URL",
  "MARKETPLACE_INTEGRATION_BASE_PATH",
  "MARKETPLACE_INTEGRATION_LISTINGS_PATH",
  "MARKETPLACE_PROVIDER_INVENTORY_PATHS",
  "MARKETPLACE_PROVIDER_FALLBACK_PROBE_ENABLED",
  "MARKETPLACE_PROVIDER_BEARER_TOKEN",
  "MARKETPLACE_PROVIDER_REQUEST_RETRIES",
  "MARKETPLACE_PROVIDER_RETRY_BASE_DELAY_MS",
  "MARKETPLACE_PROVIDER_MAX_TOTAL_REQUEST_TIME_MS",
  "MARKETPLACE_PROVIDER_REQUEST_TIMEOUT_MS",
  "MARKETPLACE_PROVIDER_INVENTORY_FAILURE_THRESHOLD",
  "MARKETPLACE_PROVIDER_INVENTORY_FAILURE_COOLDOWN_MS",
  "MARKETPLACE_INTEGRATION_KEY_ID",
  "MARKETPLACE_INTEGRATION_KEY_SECRET",
  "MARKETPLACE_INTEGRATION_REFRESH_TOKEN",
  "MARKETPLACE_SYNC_FAILURE_THRESHOLD",
  "MARKETPLACE_SYNC_COOLDOWN_MS",
];

let originalEnv = {};
let originalAxiosCreate;

const loadFreshInventoryProjectionService = ({ fetchInventoryImpl }) => {
  delete require.cache[require.resolve(marketplaceConfigPath)];
  delete require.cache[require.resolve(providerClientPath)];
  const providerClient = require(providerClientPath);
  const businessEventBus = require(businessEventBusPath);
  const metricsService = require(metricsServicePath);
  const MarketplaceProductCache = require(marketplaceProductCachePath);

  const originals = {
    fetchInventory: providerClient.fetchInventory,
    publishEvent: businessEventBus.publishEvent,
    recordMetric: metricsService.recordMetric,
    updateOne: MarketplaceProductCache.updateOne,
    find: MarketplaceProductCache.find,
  };

  providerClient.fetchInventory = fetchInventoryImpl;
  businessEventBus.publishEvent = async () => {};
  metricsService.recordMetric = async () => {};
  MarketplaceProductCache.updateOne = async () => ({ acknowledged: true });
  MarketplaceProductCache.find = () => ({
    sort: () => ({
      lean: async () => [],
    }),
  });

  delete require.cache[require.resolve(inventoryProjectionServicePath)];
  const service = require(inventoryProjectionServicePath);

  const restore = () => {
    providerClient.fetchInventory = originals.fetchInventory;
    businessEventBus.publishEvent = originals.publishEvent;
    metricsService.recordMetric = originals.recordMetric;
    MarketplaceProductCache.updateOne = originals.updateOne;
    MarketplaceProductCache.find = originals.find;
    delete require.cache[require.resolve(inventoryProjectionServicePath)];
  };

  return { service, restore };
};

const setProviderEnv = (overrides = {}) => {
  process.env.MARKETPLACE_INTEGRATION_BASE_URL = "https://sellsquare.example";
  process.env.MARKETPLACE_INTEGRATION_BASE_PATH = "/api/public/v1/marketplace";
  process.env.MARKETPLACE_INTEGRATION_LISTINGS_PATH = "/listings";
  process.env.MARKETPLACE_PROVIDER_INVENTORY_PATHS = "/inventory,/products";
  process.env.MARKETPLACE_PROVIDER_BEARER_TOKEN = "provider-static-token";
  process.env.MARKETPLACE_PROVIDER_REQUEST_RETRIES = "2";
  process.env.MARKETPLACE_PROVIDER_RETRY_BASE_DELAY_MS = "1";
  process.env.MARKETPLACE_PROVIDER_MAX_TOTAL_REQUEST_TIME_MS = "5000";
  process.env.MARKETPLACE_PROVIDER_REQUEST_TIMEOUT_MS = "5000";
  process.env.MARKETPLACE_PROVIDER_INVENTORY_FAILURE_THRESHOLD = "3";
  process.env.MARKETPLACE_PROVIDER_INVENTORY_FAILURE_COOLDOWN_MS = "30000";
  delete process.env.MARKETPLACE_INTEGRATION_KEY_ID;
  delete process.env.MARKETPLACE_INTEGRATION_KEY_SECRET;
  delete process.env.MARKETPLACE_INTEGRATION_REFRESH_TOKEN;

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  });
};

const withFreshProviderClient = () => {
  delete require.cache[require.resolve(marketplaceConfigPath)];
  delete require.cache[require.resolve(providerClientPath)];
  return require(providerClientPath);
};

test.beforeEach(() => {
  originalAxiosCreate = axios.create;
  originalEnv = Object.fromEntries(trackedEnvKeys.map((key) => [key, process.env[key]]));
});

test.afterEach(() => {
  axios.create = originalAxiosCreate;

  trackedEnvKeys.forEach((key) => {
    const previous = originalEnv[key];
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  });

  delete require.cache[require.resolve(inventoryProjectionServicePath)];
  delete require.cache[require.resolve(providerClientPath)];
  delete require.cache[require.resolve(marketplaceConfigPath)];
});

test("single-flight sync shares one in-flight run across concurrent triggers", async () => {
  let fetchCalls = 0;
  let releaseFetch;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });

  const { service, restore } = loadFreshInventoryProjectionService({
    fetchInventoryImpl: async () => {
      fetchCalls += 1;
      await fetchGate;
      return [
        {
          id: "prod-1",
          name: "Ring",
          price: 100,
          stock: { quantity: 2 },
        },
      ];
    },
  });

  try {
    const first = service.syncInventoryProjection({
      trigger: "on-demand-products-read-cold-start",
      correlationId: "corr-1",
    });
    const second = service.syncInventoryProjection({
      trigger: "scheduled-refresh",
      correlationId: "corr-2",
    });

    releaseFetch();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(fetchCalls, 1);
    assert.deepEqual(secondResult, firstResult);
    assert.equal(firstResult.correlationId, "corr-1");
    assert.equal(service.__testables.getInFlightState().inFlight, false);
  } finally {
    restore();
  }
});

test("stale refresh joins in-flight sync and does not start duplicate run", async () => {
  let fetchCalls = 0;
  let releaseFetch;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });

  const { service, restore } = loadFreshInventoryProjectionService({
    fetchInventoryImpl: async () => {
      fetchCalls += 1;
      await fetchGate;
      return [
        {
          id: "prod-2",
          name: "Necklace",
          price: 120,
          stock: { quantity: 3 },
        },
      ];
    },
  });

  try {
    const leader = service.syncInventoryProjection({
      trigger: "manual",
      correlationId: "corr-storm-1",
    });

    await Promise.resolve();

    const follower = service.syncInventoryProjectionIfStale({
      trigger: "on-demand-products-read-stale-refresh",
      maxAgeMs: 0,
      correlationId: "corr-storm-2",
    });

    releaseFetch();

    const [leaderResult, followerResult] = await Promise.all([leader, follower]);
    assert.equal(fetchCalls, 1);
    assert.deepEqual(followerResult, leaderResult);
  } finally {
    restore();
  }
});

test("provider inventory probing is limited to explicit listings path in production", async () => {
  setProviderEnv({
    NODE_ENV: "production",
    MARKETPLACE_PROVIDER_FALLBACK_PROBE_ENABLED: "",
  });

  const calls = [];
  axios.create = () => ({
    get: async (path) => {
      calls.push(path);
      const error = new Error("not found");
      error.response = { status: 404, data: {} };
      throw error;
    },
  });

  const { fetchInventory } = withFreshProviderClient();

  await assert.rejects(
    () => fetchInventory(),
    (error) => {
      assert.equal(error.code, "PROVIDER_REQUEST_REJECTED");
      return true;
    }
  );

  assert.equal(calls.length >= 1, true);
  assert.deepEqual([...new Set(calls)], ["/listings"]);
});

test("provider inventory fallback probing remains available in safe environments", async () => {
  setProviderEnv({
    NODE_ENV: "development",
    MARKETPLACE_PROVIDER_FALLBACK_PROBE_ENABLED: "",
  });

  const calls = [];
  axios.create = () => ({
    get: async (path) => {
      calls.push(path);

      if (path === "/listings") {
        const error = new Error("not found");
        error.response = { status: 404, data: {} };
        throw error;
      }

      return {
        data: {
          items: [
            {
              id: "prod-3",
              name: "Bracelet",
              price: 90,
              stock: { quantity: 1 },
            },
          ],
        },
      };
    },
  });

  const { fetchInventory } = withFreshProviderClient();
  const result = await fetchInventory();

  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  assert.equal(calls.includes("/listings"), true);
  assert.equal(calls.includes("/inventory"), true);
});

test("provider inventory circuit opens after repeated upstream failures", async () => {
  setProviderEnv({
    NODE_ENV: "development",
    MARKETPLACE_PROVIDER_FALLBACK_PROBE_ENABLED: "false",
    MARKETPLACE_PROVIDER_INVENTORY_FAILURE_THRESHOLD: "2",
    MARKETPLACE_PROVIDER_INVENTORY_FAILURE_COOLDOWN_MS: "60000",
  });

  let getCalls = 0;
  axios.create = () => ({
    get: async () => {
      getCalls += 1;
      const error = new Error("timeout");
      error.code = "ECONNABORTED";
      throw error;
    },
  });

  const { fetchInventory } = withFreshProviderClient();

  await assert.rejects(() => fetchInventory());
  await assert.rejects(() => fetchInventory());

  await assert.rejects(
    () => fetchInventory(),
    (error) => {
      assert.equal(error.code, "PROVIDER_INVENTORY_CIRCUIT_OPEN");
      return true;
    }
  );

  assert.equal(getCalls >= 2, true);
  assert.equal(getCalls < 6, true);
});
