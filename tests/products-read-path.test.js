const test = require("node:test");
const assert = require("node:assert/strict");

const productControllerPath = "../controllers/productController";
const configPath = "../config/marketplaceConfig";
const projectionServicePath = "../services/marketplace/inventoryProjectionService";
const availabilityPath = "../utils/productAvailability";
const metricsPath = "../services/marketplace/metricsService";

const createMockRes = () => {
  const headers = {};
  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(key, value) {
      headers[key.toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
};

const withMockedController = ({
  projectedProducts = [],
  syncIfStaleImpl = async () => ({}),
  syncImpl = async () => ({}),
  instantProductsRenderEnabled = true,
} = {}) => {
  delete require.cache[require.resolve(productControllerPath)];

  const config = require(configPath);
  const projection = require(projectionServicePath);
  const availability = require(availabilityPath);
  const metrics = require(metricsPath);

  const originals = {
    shouldUseProviderProducts: config.shouldUseProviderProducts,
    getMarketplaceConfig: config.getMarketplaceConfig,
    getProjectedProducts: projection.getProjectedProducts,
    syncInventoryProjectionIfStale: projection.syncInventoryProjectionIfStale,
    syncInventoryProjection: projection.syncInventoryProjection,
    getProjectionSyncState: projection.getProjectionSyncState,
    applyEffectiveAvailability: availability.applyEffectiveAvailability,
    recordMetric: metrics.recordMetric,
  };

  config.shouldUseProviderProducts = () => true;
  config.getMarketplaceConfig = () => ({
    instantProductsRenderEnabled,
  });
  projection.getProjectedProducts = async () => projectedProducts;
  projection.syncInventoryProjectionIfStale = syncIfStaleImpl;
  projection.syncInventoryProjection = syncImpl;
  projection.getProjectionSyncState = () => ({
    inFlight: false,
    lastSuccessfulSyncAt: Date.now() - 1000,
  });
  availability.applyEffectiveAvailability = async (items) => items;
  metrics.recordMetric = async () => {};

  const { getProducts } = require(productControllerPath);

  const restore = () => {
    config.shouldUseProviderProducts = originals.shouldUseProviderProducts;
    config.getMarketplaceConfig = originals.getMarketplaceConfig;
    projection.getProjectedProducts = originals.getProjectedProducts;
    projection.syncInventoryProjectionIfStale = originals.syncInventoryProjectionIfStale;
    projection.syncInventoryProjection = originals.syncInventoryProjection;
    projection.getProjectionSyncState = originals.getProjectionSyncState;
    availability.applyEffectiveAvailability = originals.applyEffectiveAvailability;
    metrics.recordMetric = originals.recordMetric;
    delete require.cache[require.resolve(productControllerPath)];
  };

  return { getProducts, restore };
};

const sampleProjectedProduct = {
  providerProductId: "prod-1",
  name: "Ring",
  description: "Classic ring",
  category: "Rings",
  image: "https://example.com/ring.jpg",
  price: 100,
  priceBase: 120,
  priceEffective: 100,
  availableQuantity: 3,
  updatedAt: new Date().toISOString(),
  providerUpdatedAt: new Date().toISOString(),
  metadata: { listingType: "single" },
};

test("cache-hit returns immediately and triggers async stale refresh", async () => {
  let staleRefreshCalls = 0;

  const { getProducts, restore } = withMockedController({
    projectedProducts: [sampleProjectedProduct],
    syncIfStaleImpl: async () => {
      staleRefreshCalls += 1;
      return { syncedCount: 1 };
    },
  });

  try {
    const req = { headers: {} };
    const res = createMockRes();

    await getProducts(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(Array.isArray(res.body), true);
    assert.equal(res.body.length, 1);
    assert.equal(staleRefreshCalls, 1);
    assert.equal(res.headers["x-marketplace-products-source"], "projection-cache");
  } finally {
    restore();
  }
});

test("empty projection path returns quickly and does not await provider warm sync", async () => {
  let releaseWarmSync;
  const warmSyncGate = new Promise((resolve) => {
    releaseWarmSync = resolve;
  });

  let staleRefreshCalls = 0;

  const { getProducts, restore } = withMockedController({
    projectedProducts: [],
    syncIfStaleImpl: async () => {
      staleRefreshCalls += 1;
      await warmSyncGate;
      return { syncedCount: 0 };
    },
  });

  try {
    const req = { headers: {} };
    const res = createMockRes();
    const startedAt = Date.now();

    await getProducts(req, res);
    const durationMs = Date.now() - startedAt;

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
    assert.equal(staleRefreshCalls, 1);
    assert.equal(res.headers["x-marketplace-products-status"], "warming");
    assert.equal(durationMs < 200, true);
  } finally {
    releaseWarmSync();
    restore();
  }
});

test("provider sync failure still serves cached products", async () => {
  const { getProducts, restore } = withMockedController({
    projectedProducts: [sampleProjectedProduct],
    syncIfStaleImpl: async () => {
      throw new Error("provider unavailable");
    },
  });

  try {
    const req = { headers: {} };
    const res = createMockRes();

    await getProducts(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(Array.isArray(res.body), true);
    assert.equal(res.body.length, 1);
  } finally {
    restore();
  }
});
