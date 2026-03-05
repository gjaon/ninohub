const Cart = require("../models/cartModel");
const InventoryHold = require("../models/inventoryHoldModel");

const availabilityCacheTtlMs = Number(process.env.PRODUCT_AVAILABILITY_CACHE_TTL_MS || 2000);
const combinedHoldTotalsCache = new Map();

const normalizeId = (value) => String(value || "").trim();

const toFiniteQuantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const buildVariantKey = (listingId, variantId = "") => `${normalizeId(listingId)}::${normalizeId(variantId)}`;

const incrementMap = (map, key, quantity) => {
  const normalizedKey = normalizeId(key);
  const safeQty = toFiniteQuantity(quantity);
  if (!normalizedKey || !safeQty) {
    return;
  }

  map.set(normalizedKey, Number(map.get(normalizedKey) || 0) + safeQty);
};

const resolveLineIdentity = (item = {}) => {
  const listingId =
    normalizeId(item?.listingId)
    || normalizeId(item?.parentGroupId)
    || normalizeId(item?.productId);
  const variantId = normalizeId(item?.variantId);
  const quantity = toFiniteQuantity(item?.quantity);

  return {
    listingId,
    variantId,
    quantity,
  };
};

const aggregateHoldItems = (items = [], listingTotals = new Map(), variantTotals = new Map()) => {
  for (const item of Array.isArray(items) ? items : []) {
    const { listingId, variantId, quantity } = resolveLineIdentity(item);
    if (!listingId || !quantity) {
      continue;
    }

    incrementMap(listingTotals, listingId, quantity);

    if (variantId) {
      incrementMap(variantTotals, buildVariantKey(listingId, variantId), quantity);
    }
  }

  return {
    listingTotals,
    variantTotals,
  };
};

const cloneHoldTotals = ({ listingTotals = new Map(), variantTotals = new Map() } = {}) => ({
  listingTotals: new Map(listingTotals),
  variantTotals: new Map(variantTotals),
});

const buildCacheKey = ({ excludeCartId = null } = {}) => String(excludeCartId || "all");

const collectCombinedHoldTotals = async ({ excludeCartId = null, useCache = true } = {}) => {
  const cacheEnabled = useCache && Number.isFinite(availabilityCacheTtlMs) && availabilityCacheTtlMs > 0;
  const cacheKey = buildCacheKey({ excludeCartId });

  if (cacheEnabled) {
    const now = Date.now();
    const cached = combinedHoldTotalsCache.get(cacheKey);

    if (cached?.value && cached.expiresAt > now) {
      return cloneHoldTotals(cached.value);
    }

    if (cached?.promise) {
      const pendingResult = await cached.promise;
      return cloneHoldTotals(pendingResult);
    }
  }

  const computePromise = (async () => {
  const now = new Date();
  const listingTotals = new Map();
  const variantTotals = new Map();

  const cartQuery = {
    reservationStatus: { $in: ["active", "checkout"] },
    items: { $exists: true, $ne: [] },
    $or: [{ reservationExpiry: null }, { reservationExpiry: { $gt: now } }],
  };

  if (excludeCartId) {
    cartQuery._id = { $ne: excludeCartId };
  }

  const [activeCarts, activeInventoryHolds] = await Promise.all([
    Cart.find(cartQuery).select("items").lean(),
    InventoryHold.find({ status: "active", expiresAt: { $gt: now } })
      .select("items")
      .lean(),
  ]);

  for (const cart of activeCarts) {
    aggregateHoldItems(cart?.items, listingTotals, variantTotals);
  }

  for (const hold of activeInventoryHolds) {
    aggregateHoldItems(hold?.items, listingTotals, variantTotals);
  }

  return {
    listingTotals,
    variantTotals,
  };
  })();

  if (cacheEnabled) {
    combinedHoldTotalsCache.set(cacheKey, {
      value: null,
      expiresAt: 0,
      promise: computePromise,
    });
  }

  try {
    const computed = await computePromise;

    if (cacheEnabled) {
      combinedHoldTotalsCache.set(cacheKey, {
        value: computed,
        expiresAt: Date.now() + availabilityCacheTtlMs,
      });
    }

    return cloneHoldTotals(computed);
  } catch (error) {
    if (cacheEnabled) {
      combinedHoldTotalsCache.delete(cacheKey);
    }
    throw error;
  }
};

const applyEffectiveAvailability = async (products = [], options = {}) => {
  const holdTotals = await collectCombinedHoldTotals({
    excludeCartId: options?.excludeCartId || null,
    useCache: options?.useCache !== false,
  });

  const nextProducts = (Array.isArray(products) ? products : []).map((product) => {
    const listingId = normalizeId(product?.listingId || product?.id || product?.providerProductId);
    const baseAvailable = Math.max(0, Number(product?.availableQuantity || 0));
    const heldForListing = Number(holdTotals.listingTotals.get(listingId) || 0);
    const effectiveAvailable = Math.max(0, baseAvailable - heldForListing);

    const nextVariants = (Array.isArray(product?.variants) ? product.variants : []).map((variant) => {
      const variantId = normalizeId(variant?.variantId || variant?.id);
      const variantBaseAvailable = Math.max(0, Number(variant?.availableQuantity || 0));
      const heldForVariant = Number(
        holdTotals.variantTotals.get(buildVariantKey(listingId, variantId)) || 0
      );
      const variantEffectiveAvailable = Math.max(0, variantBaseAvailable - heldForVariant);

      return {
        ...variant,
        baseAvailableQuantity: variantBaseAvailable,
        heldQuantity: heldForVariant,
        availableQuantity: variantEffectiveAvailable,
      };
    });

    return {
      ...product,
      baseAvailableQuantity: baseAvailable,
      heldQuantity: heldForListing,
      availableQuantity: effectiveAvailable,
      variants: nextVariants,
    };
  });

  return nextProducts;
};

const resolveLineAvailableQuantity = (products = [], item = {}) => {
  const listingId = normalizeId(item?.listingId || item?.parentGroupId || item?.productId);
  const variantId = normalizeId(item?.variantId);

  const product = (Array.isArray(products) ? products : []).find(
    (entry) => normalizeId(entry?.listingId || entry?.id || entry?.providerProductId) === listingId
  );

  if (!product) {
    return 0;
  }

  if (variantId) {
    const variant = (Array.isArray(product?.variants) ? product.variants : []).find(
      (entry) => normalizeId(entry?.variantId || entry?.id) === variantId
    );

    return Math.max(0, Number(variant?.availableQuantity || 0));
  }

  return Math.max(0, Number(product?.availableQuantity || 0));
};

module.exports = {
  normalizeId,
  collectCombinedHoldTotals,
  applyEffectiveAvailability,
  resolveLineAvailableQuantity,
  cloneHoldTotals,
};
