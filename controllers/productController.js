const products = require("../data/product");
const { v4: uuidv4 } = require("uuid");
const { shouldUseProviderProducts, getMarketplaceConfig } = require("../config/marketplaceConfig");
const {
  getProjectedProducts,
  syncInventoryProjection,
  syncInventoryProjectionIfStale,
  getProjectionSyncState,
} = require("../services/marketplace/inventoryProjectionService");
const { recordMetric } = require("../services/marketplace/metricsService");
const { applyEffectiveAvailability } = require("../utils/productAvailability");

const LATENCY_SAMPLE_LIMIT = 120;
const productsReadLatencySamples = [];

const toLatencyBucket = (latencyMs) => {
  const value = Number(latencyMs || 0);
  if (value < 100) return "lt-100ms";
  if (value < 250) return "100-249ms";
  if (value < 500) return "250-499ms";
  if (value < 1000) return "500-999ms";
  if (value < 2000) return "1000-1999ms";
  return "gte-2000ms";
};

const percentile = (samples = [], ratio = 0.5) => {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
};

const trackProductsReadLatency = (latencyMs) => {
  const bounded = Math.max(0, Number(latencyMs || 0));
  productsReadLatencySamples.push(bounded);
  if (productsReadLatencySamples.length > LATENCY_SAMPLE_LIMIT) {
    productsReadLatencySamples.shift();
  }

  return {
    p50: percentile(productsReadLatencySamples, 0.5),
    p95: percentile(productsReadLatencySamples, 0.95),
  };
};

const writeProductsReadHeaders = (res, metadata = {}) => {
  const entries = {
    "x-marketplace-products-source": metadata.source || "unknown",
    "x-marketplace-products-cache-age-ms": String(Math.max(0, Number(metadata.cacheAgeMs || 0))),
    "x-marketplace-products-last-successful-sync-at": metadata.lastSuccessfulSyncAt
      ? new Date(metadata.lastSuccessfulSyncAt).toISOString()
      : "",
    "x-marketplace-products-correlation-id": metadata.correlationId || "",
    "x-marketplace-products-status": metadata.status || "ok",
  };

  Object.entries(entries).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      res.setHeader(key, String(value));
    }
  });
};

const toSafeString = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  return "";
};

const extractImageStrings = (value, collector) => {
  if (!value) {
    return;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const normalized = toSafeString(value);
    if (normalized) {
      collector.push(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => extractImageStrings(entry, collector));
    return;
  }

  if (typeof value === "object") {
    const directKeys = ["url", "filePath", "secure_url", "src", "image"];
    directKeys.forEach((key) => extractImageStrings(value?.[key], collector));
  }
};

const collectProductImages = (product) => {
  const images = [];
  const metadata = product?.metadata || {};
  const variants = [
    ...(Array.isArray(product?.variants) ? product.variants : []),
    ...(Array.isArray(metadata?.variants) ? metadata.variants : []),
  ];

  extractImageStrings(product?.primaryImage, images);
  extractImageStrings(product?.selectedImage, images);
  extractImageStrings(product?.image, images);
  extractImageStrings(product?.images, images);
  extractImageStrings(metadata?.image, images);
  extractImageStrings(metadata?.images, images);

  variants.forEach((variant) => {
    extractImageStrings(variant?.image, images);
    extractImageStrings(variant?.images, images);
    extractImageStrings(variant?.metadata?.image, images);
    extractImageStrings(variant?.metadata?.images, images);
  });

  return Array.from(new Set(images.filter(Boolean)));
};

const normalizeVariants = (variants = []) => {
  if (!Array.isArray(variants)) {
    return [];
  }

  return variants.map((variant) => {
    const effectivePrice = Number(
      variant?.priceEffective
      ?? variant?.price?.effective
      ?? variant?.effectivePrice
      ?? variant?.price
      ?? 0
    );
    const originalPrice = Number(
      variant?.priceBase
      ?? variant?.price?.base
      ?? variant?.basePrice
      ?? variant?.originalPrice
      ?? effectivePrice
    );
    const discountPercent =
      Number.isFinite(Number(variant?.discountPercent)) && Number(variant?.discountPercent) > 0
        ? Math.round(Number(variant?.discountPercent))
        : originalPrice > effectivePrice && originalPrice > 0
        ? Math.round(((originalPrice - effectivePrice) / originalPrice) * 100)
        : 0;

    const variantImages = [];
    extractImageStrings(variant?.image, variantImages);
    extractImageStrings(variant?.images, variantImages);
    extractImageStrings(variant?.metadata?.image, variantImages);
    extractImageStrings(variant?.metadata?.images, variantImages);
    const normalizedVariantImages = Array.from(new Set(variantImages.filter(Boolean)));

    return {
      ...variant,
      variantId: toSafeString(variant?.variantId || variant?.id),
      id: toSafeString(variant?.variantId || variant?.id),
      name: toSafeString(variant?.name || variant?.variantName || variant?.variantId || variant?.id),
      price: effectivePrice,
      effectivePrice,
      basePrice: originalPrice,
      originalPrice,
      discountPercent,
      discountMetadata: variant?.discountMetadata || variant?.discount || null,
      image:
        toSafeString(variant?.image)
        || normalizedVariantImages[0]
        || "",
      images: normalizedVariantImages,
    };
  });
};

const toFrontendProduct = (product) => {
  const effectivePrice = Number(
    product?.priceEffective
    ?? product?.effectivePrice
    ??
    product?.metadata?.price?.effective
    ?? product?.price?.effective
    ?? product?.price
    ?? 0
  );
  const originalPrice = Number(
    product?.priceBase
    ?? product?.basePrice
    ??
    product?.metadata?.price?.base
    ?? product?.price?.base
    ?? product?.originalPrice
    ?? effectivePrice
  );
  const discountPercent =
    Number.isFinite(Number(product?.discountPercent)) && Number(product?.discountPercent) > 0
      ? Math.round(Number(product?.discountPercent))
      : originalPrice > effectivePrice && originalPrice > 0
      ? Math.round(((originalPrice - effectivePrice) / originalPrice) * 100)
      : 0;

  const variantSource = Array.isArray(product?.variantSnapshots) && product.variantSnapshots.length
    ? product.variantSnapshots
    : Array.isArray(product?.metadata?.variants)
      ? product.metadata.variants
      : product?.variants;

  return {
    ...product,
    id: String(product.providerProductId || product.id || product.productId),
    name:
      (product?.metadata?.listingType || product?.listingType) === "group"
        ? (product?.metadata?.groupName || product?.groupName || product.name || "Unnamed Product")
        : (product.name || "Unnamed Product"),
    description: product.description || "",
    category: product.category || "Uncategorized",
    image: toSafeString(product.image),
    price: effectivePrice,
    effectivePrice,
    basePrice: originalPrice,
    originalPrice,
    discountPercent,
    discountMetadata: product?.discountMetadata || product?.metadata?.discount || null,
    sku: product.sku || null,
    availableQuantity: Number(product.availableQuantity ?? 0),
    customizable: Boolean(product.customizable),
    listingType: product?.metadata?.listingType || product?.listingType || "single",
    listingId: String(product?.metadata?.groupId || product?.providerProductId || product?.id || product?.productId),
    groupName: product?.metadata?.groupName || product?.groupName || null,
    parentGroupId: product?.metadata?.groupId || product?.parentGroupId || null,
    variantId: product?.metadata?.variantId || product?.variantId || null,
    variantName: product?.metadata?.name || product?.variantName || null,
    variants: normalizeVariants(variantSource),
    syncedAt: product.providerUpdatedAt || product.updatedAt || null,
    ...(function withNormalizedImages() {
      const normalizedImages = collectProductImages(product);
      const primaryImage =
        toSafeString(product.primaryImage)
        || toSafeString(product.selectedImage)
        || toSafeString(product.image)
        || normalizedImages[0]
        || "";
      const selectedImage =
        toSafeString(product.selectedImage)
        || primaryImage
        || "";

      const images = Array.from(
        new Set([primaryImage, ...normalizedImages].filter(Boolean))
      );

      return {
        primaryImage,
        images,
        selectedImage,
        image: toSafeString(product.image) || primaryImage || "",
      };
    })(),
  };
};

const triggerProjectionRefreshInBackground = ({ trigger, correlationId }) => {
  syncInventoryProjectionIfStale({
    trigger,
    maxAgeMs: Number(process.env.MARKETPLACE_PRODUCTS_SYNC_MAX_AGE_MS || 30000),
    correlationId,
  }).catch((error) => {
    console.warn("[products:projection-refresh] stale refresh skipped", error.message);
  });
};

const recordReadMetricSafe = async (key, labels = {}) => {
  try {
    await recordMetric(key, labels);
  } catch (_error) {
  }
};

const getProducts = async (req, res) => {
  const requestStartedAt = Date.now();
  const correlationId = String(req.headers["x-correlation-id"] || "").trim() || uuidv4();
  const useProviderProducts = shouldUseProviderProducts();
  const marketplaceConfig = getMarketplaceConfig();
  const instantProductsRenderEnabled = Boolean(marketplaceConfig.instantProductsRenderEnabled);
  if (!useProviderProducts) {
    recordReadMetricSafe("marketplace.products.read.path", {
      source: "http-get-products",
      cachePath: "local-fallback",
    });
    const normalized = await applyEffectiveAvailability(products.map(toFrontendProduct));
    writeProductsReadHeaders(res, {
      source: "local-fallback",
      cacheAgeMs: 0,
      lastSuccessfulSyncAt: null,
      correlationId,
      status: "ok",
    });
    return res.status(200).json(normalized);
  }

  const syncStateBefore = getProjectionSyncState();
  const cacheAgeMsBefore = syncStateBefore.lastSuccessfulSyncAt
    ? Math.max(0, Date.now() - Number(syncStateBefore.lastSuccessfulSyncAt))
    : 0;

  const finalizeRead = async ({ payload, cachePath, source, status = "ok", cacheAgeMs = cacheAgeMsBefore }) => {
    const latencyMs = Math.max(0, Date.now() - requestStartedAt);
    const { p50, p95 } = trackProductsReadLatency(latencyMs);

    writeProductsReadHeaders(res, {
      source,
      cacheAgeMs,
      lastSuccessfulSyncAt: syncStateBefore.lastSuccessfulSyncAt,
      correlationId,
      status,
    });

    await Promise.all([
      recordReadMetricSafe("marketplace.products.read.path", {
        source: "http-get-products",
        cachePath,
      }),
      recordReadMetricSafe("marketplace.products.read.latency_bucket", {
        source: "http-get-products",
        cachePath,
        bucket: toLatencyBucket(latencyMs),
      }),
      recordReadMetricSafe("marketplace.products.read.latency_percentile", {
        source: "http-get-products",
        percentile: "p50",
        bucket: toLatencyBucket(p50),
      }),
      recordReadMetricSafe("marketplace.products.read.latency_percentile", {
        source: "http-get-products",
        percentile: "p95",
        bucket: toLatencyBucket(p95),
      }),
    ]);

    return res.status(200).json(payload);
  };

  const trigger = syncStateBefore.inFlight
    ? "on-demand-products-read-join-inflight"
    : "on-demand-products-read-stale-refresh";

  let projected = await getProjectedProducts();

  if (projected.length) {
    console.info("[marketplace:products-read] cache-hit", {
      source: "http-get-products",
      cachedCount: projected.length,
      correlationId,
    });
    triggerProjectionRefreshInBackground({ trigger, correlationId });
    const normalized = await applyEffectiveAvailability(projected.map(toFrontendProduct));
    return finalizeRead({
      payload: normalized,
      cachePath: syncStateBefore.inFlight ? "sync-joined-inflight" : "cache-hit-stale-refresh",
      source: "projection-cache",
      cacheAgeMs: cacheAgeMsBefore,
    });
  }

  console.info("[marketplace:products-read] cache-miss-empty-projection", {
    source: "http-get-products",
    correlationId,
  });

  if (!instantProductsRenderEnabled) {
    await syncInventoryProjection({ trigger: "on-demand-products-read-cold-start", correlationId });
    projected = await getProjectedProducts();
    if (!projected.length) {
      return res.status(502).json({
        message: "Provider inventory is unavailable. No projected products found.",
      });
    }
    const normalized = await applyEffectiveAvailability(projected.map(toFrontendProduct));
    return finalizeRead({
      payload: normalized,
      cachePath: "cold-start-sync-blocking",
      source: "projection-cache",
      status: "ok",
      cacheAgeMs: 0,
    });
  }

  syncInventoryProjectionIfStale({
    trigger: "on-demand-products-read-cold-start-warm",
    maxAgeMs: 0,
    correlationId,
  }).catch((error) => {
    console.warn("[products:projection-refresh] cold-start warm skipped", {
      correlationId,
      message: error.message,
    });
  });

  return finalizeRead({
    payload: [],
    cachePath: "cold-start-empty-async-warm",
    source: "projection-cache-empty",
    status: "warming",
    cacheAgeMs: cacheAgeMsBefore,
  });
};

const getProductById = async (req, res) => {
  const { id } = req.params;
  const useProviderProducts = shouldUseProviderProducts();

  let source;

  if (useProviderProducts) {
    let projected = await getProjectedProducts();

    if (projected.length) {
      recordReadMetricSafe("marketplace.products.read.path", {
        source: "http-get-product-by-id",
        cachePath: "cache-hit-stale-refresh",
      });
      triggerProjectionRefreshInBackground({
        trigger: "on-demand-product-detail-read-stale-refresh",
        correlationId: uuidv4(),
      });
    }

    if (!projected.length) {
      recordReadMetricSafe("marketplace.products.read.path", {
        source: "http-get-product-by-id",
        cachePath: "cold-start-sync",
      });
      await syncInventoryProjection({ trigger: "on-demand-product-detail-read-cold-start" });
      projected = await getProjectedProducts();
    }
    source = projected.map(toFrontendProduct);
  } else {
    source = products.map(toFrontendProduct);
  }

  source = await applyEffectiveAvailability(source);

  const product = source.find((item) => String(item.id) === String(id));

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  res.status(200).json(product);
};

module.exports = {
  getProducts,
  getProductById,
  __testables: {
    toFrontendProduct,
    normalizeVariants,
  },
};
