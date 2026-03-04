const { v4: uuidv4 } = require("uuid");
const MarketplaceProductCache = require("../../models/marketplaceProductCacheModel");
const providerClient = require("./providerClient");
const { publishEvent } = require("./businessEventBus");

let lastSuccessfulSyncAt = 0;

const toFiniteNumber = (value, fallback = 0) => {
  const candidate = typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toValidDate = (value) => {
  if (!value) {
    return new Date();
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
};

const toNullableDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const toSafeString = (value, fallback = "") => {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
};

const resolveImageValue = (value) => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => Boolean(resolveImageValue(entry)));
    return resolveImageValue(first);
  }

  if (value && typeof value === "object") {
    return toSafeString(
      value.url || value.filePath || value.secure_url || value.src || value.image || "",
      ""
    );
  }

  return "";
};

const extractDiscountPercent = (value) => {
  const parsed = toFiniteNumber(value, 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(parsed)));
};

const normalizeDiscountSnapshot = ({
  effectiveCandidates = [],
  baseCandidates = [],
  discountPercentCandidates = [],
  metadataCandidates = [],
}) => {
  const effective = toFiniteNumber(
    effectiveCandidates.find((candidate) => Number.isFinite(toFiniteNumber(candidate, NaN))),
    0
  );

  const parsedBase = toFiniteNumber(
    baseCandidates.find((candidate) => Number.isFinite(toFiniteNumber(candidate, NaN))),
    NaN
  );
  const base = Number.isFinite(parsedBase) && parsedBase > 0 ? parsedBase : effective;

  const derivedPercent = base > effective && base > 0
    ? Math.round(((base - effective) / base) * 100)
    : 0;
  const providedPercent = extractDiscountPercent(
    discountPercentCandidates.find((candidate) => Number.isFinite(toFiniteNumber(candidate, NaN)))
  );

  const discountPercent = providedPercent > 0 ? providedPercent : derivedPercent;

  const rawMetadata = metadataCandidates.find(
    (candidate) => candidate && typeof candidate === "object" && Object.keys(candidate).length
  ) || null;

  return {
    base,
    effective,
    discountPercent,
    metadata: {
      hasDiscount: discountPercent > 0,
      source: rawMetadata ? "provider" : "derived",
      startsAt: toNullableDate(rawMetadata?.startsAt || rawMetadata?.startAt || rawMetadata?.validFrom),
      endsAt: toNullableDate(rawMetadata?.endsAt || rawMetadata?.endAt || rawMetadata?.validUntil),
      label: toSafeString(rawMetadata?.label || rawMetadata?.name || rawMetadata?.reason, "") || null,
      raw: rawMetadata,
    },
  };
};

const normalizeVariantSnapshot = (variant, fallback = {}) => {
  const pricing = normalizeDiscountSnapshot({
    effectiveCandidates: [
      variant?.price?.effective,
      variant?.effectivePrice,
      variant?.currentPrice,
      variant?.salePrice,
      variant?.price,
      fallback?.price,
    ],
    baseCandidates: [
      variant?.price?.base,
      variant?.basePrice,
      variant?.originalPrice,
      variant?.listPrice,
      variant?.price?.original,
      fallback?.price,
    ],
    discountPercentCandidates: [
      variant?.discountPercent,
      variant?.discount?.percent,
      variant?.price?.discountPercent,
    ],
    metadataCandidates: [
      variant?.discount,
      variant?.price?.discount,
      variant?.price?.promotion,
    ],
  });

  return {
    variantId: toSafeString(variant?.variantId || variant?.id, ""),
    id: toSafeString(variant?.variantId || variant?.id, ""),
    name: toSafeString(variant?.name || variant?.variantName || variant?.id, ""),
    sku: toSafeString(variant?.sku, "") || null,
    price: pricing.effective,
    priceEffective: pricing.effective,
    priceBase: pricing.base,
    discountPercent: pricing.discountPercent,
    discountMetadata: pricing.metadata,
    variantSnapshots: [],
    currency: toSafeString(variant?.currency || variant?.price?.currency || fallback?.currency, "NGN") || "NGN",
    availableQuantity: toFiniteNumber(
      variant?.stock?.quantity ?? variant?.stock ?? variant?.quantity ?? variant?.availableQuantity,
      0
    ),
    image: resolveImageValue(variant?.image || variant?.images || fallback?.image),
    images: Array.isArray(variant?.images) ? variant.images : [],
    metadata: variant,
  };
};

const mapFlatProviderProduct = (item) => {
  const providerProductId = item?.id || item?.productId || item?.sku;
  if (!providerProductId) {
    return null;
  }

  const pricing = normalizeDiscountSnapshot({
    effectiveCandidates: [
      item?.price?.effective,
      item?.effectivePrice,
      item?.currentPrice,
      item?.salePrice,
      item?.price,
    ],
    baseCandidates: [
      item?.price?.base,
      item?.basePrice,
      item?.originalPrice,
      item?.listPrice,
      item?.price?.original,
    ],
    discountPercentCandidates: [
      item?.discountPercent,
      item?.discount?.percent,
      item?.price?.discountPercent,
    ],
    metadataCandidates: [
      item?.discount,
      item?.price?.discount,
      item?.price?.promotion,
    ],
  });

  return {
    providerProductId: String(providerProductId),
    sku: toSafeString(item.sku, "") || null,
    name: toSafeString(item.name || item.title || item.productName, "Unnamed Product"),
    description: toSafeString(item.description, ""),
    category: toSafeString(item.category, "Uncategorized"),
    image: resolveImageValue(item.image || item.images || item.media),
    price: pricing.effective,
    priceBase: pricing.base,
    priceEffective: pricing.effective,
    discountPercent: pricing.discountPercent,
    discountMetadata: pricing.metadata,
    variantSnapshots: [],
    currency: toSafeString(item.currency || item?.price?.currency, "NGN") || "NGN",
    availableQuantity: toFiniteNumber(
      item?.availableQuantity ?? item?.stock?.quantity ?? item?.stock ?? item?.quantity,
      0
    ),
    isActive: item.isActive !== false,
    providerUpdatedAt: toValidDate(item.updatedAt),
    metadata: item,
  };
};

const mapSellSquareSingleListing = (item) => {
  const providerProductId = item?.productId;
  if (!providerProductId) {
    return null;
  }

  const pricing = normalizeDiscountSnapshot({
    effectiveCandidates: [
      item?.price?.effective,
      item?.effectivePrice,
      item?.currentPrice,
      item?.salePrice,
      item?.price,
    ],
    baseCandidates: [
      item?.price?.base,
      item?.basePrice,
      item?.originalPrice,
      item?.listPrice,
      item?.price?.original,
    ],
    discountPercentCandidates: [
      item?.discountPercent,
      item?.discount?.percent,
      item?.price?.discountPercent,
    ],
    metadataCandidates: [
      item?.discount,
      item?.price?.discount,
      item?.price?.promotion,
    ],
  });

  return {
    providerProductId: String(providerProductId),
    sku: toSafeString(item.sku, "") || null,
    name: toSafeString(item.name, "Unnamed Product"),
    description: toSafeString(item.description, ""),
    category: toSafeString(item.category, "Uncategorized"),
    image: resolveImageValue(item.image || item.images),
    price: pricing.effective,
    priceBase: pricing.base,
    priceEffective: pricing.effective,
    discountPercent: pricing.discountPercent,
    discountMetadata: pricing.metadata,
    currency: toSafeString(item.currency || item?.price?.currency, "NGN") || "NGN",
    availableQuantity: toFiniteNumber(item?.stock?.quantity, 0),
    isActive: item.listed !== false,
    providerUpdatedAt: toValidDate(item.updatedAt),
    metadata: item,
  };
};

const mapSellSquareGroupListing = (item) => {
  const groupId = toSafeString(item.groupId || item.productId || item.id, "");
  if (!groupId) {
    return [];
  }

  const sourceVariants = Array.isArray(item.variants) ? item.variants : [];
  const normalizedVariants = sourceVariants
    .map((variant) => {
      const variantSnapshot = normalizeVariantSnapshot(variant, {
        price: item?.price,
        currency: item?.currency,
        image: item?.image || item?.images,
      });

      if (!variantSnapshot.variantId) {
        return null;
      }

      return {
        ...variantSnapshot,
        name: variantSnapshot.name || variantSnapshot.variantId,
      };
    })
    .filter(Boolean);

  if (!normalizedVariants.length) {
    return [];
  }

  const variantPrices = normalizedVariants
    .map((variant) => toFiniteNumber(variant?.priceEffective, 0))
    .filter((price) => Number.isFinite(price) && price > 0);
  const representativePrice = variantPrices.length ? Math.min(...variantPrices) : 0;

  const representativeVariant = normalizedVariants
    .find((variant) => toFiniteNumber(variant?.priceEffective, 0) === representativePrice)
    || normalizedVariants[0];

  const pricing = normalizeDiscountSnapshot({
    effectiveCandidates: [
      item?.price?.effective,
      item?.effectivePrice,
      item?.currentPrice,
      item?.salePrice,
      representativeVariant?.priceEffective,
      representativePrice,
    ],
    baseCandidates: [
      item?.price?.base,
      item?.basePrice,
      item?.originalPrice,
      item?.listPrice,
      representativeVariant?.priceBase,
    ],
    discountPercentCandidates: [
      item?.discountPercent,
      item?.discount?.percent,
      item?.price?.discountPercent,
      representativeVariant?.discountPercent,
    ],
    metadataCandidates: [
      item?.discount,
      item?.price?.discount,
      item?.price?.promotion,
      representativeVariant?.discountMetadata?.raw,
    ],
  });
  const totalAvailable = normalizedVariants.reduce(
    (sum, variant) => sum + toFiniteNumber(variant?.availableQuantity, 0),
    0
  );

  return [
    {
      providerProductId: String(groupId),
      sku: toSafeString(item.sku, "") || null,
      name: toSafeString(item.groupName || item.name, "Unnamed Product"),
      description: toSafeString(item.description, ""),
      category: toSafeString(item.category, "Uncategorized"),
      image: resolveImageValue(item.image || item.images || normalizedVariants[0]?.image),
      price: pricing.effective,
      priceBase: pricing.base,
      priceEffective: pricing.effective,
      discountPercent: pricing.discountPercent,
      discountMetadata: pricing.metadata,
      variantSnapshots: normalizedVariants,
      currency:
        toSafeString(item.currency || normalizedVariants[0]?.currency || item?.price?.currency, "NGN") || "NGN",
      availableQuantity: totalAvailable,
      isActive: item.listed !== false,
      providerUpdatedAt: toValidDate(item.updatedAt),
      metadata: {
        ...item,
        listingType: "group",
        groupId: groupId || null,
        groupName: item.groupName || item.name || "",
        variants: normalizedVariants,
      },
    },
  ];
};

const mapProviderProducts = (item) => {
  if (!item || typeof item !== "object") {
    return [];
  }

  const listingType = String(item.listingType || item?.metadata?.listingType || "").toLowerCase();

  if (listingType === "single") {
    const mapped = mapSellSquareSingleListing(item);
    return mapped ? [mapped] : [];
  }

  if (listingType === "group") {
    return mapSellSquareGroupListing(item);
  }

  const mapped = mapFlatProviderProduct(item);
  return mapped ? [mapped] : [];
};

const syncInventoryProjection = async ({ trigger = "manual", correlationId } = {}) => {
  const nextCorrelationId = correlationId || uuidv4();
  console.info("[marketplace:inventory-sync] started", {
    trigger,
    correlationId: nextCorrelationId,
  });

  const fetchedInventory = await providerClient.fetchInventory();
  const providerInventory = Array.isArray(fetchedInventory) ? fetchedInventory : [];

  console.info("[marketplace:inventory-sync] provider payload received", {
    trigger,
    correlationId: nextCorrelationId,
    providerCount: providerInventory.length,
  });

  let syncedCount = 0;
  let skippedCount = 0;

  for (const [index, product] of providerInventory.entries()) {
    if (!product || typeof product !== "object") {
      skippedCount += 1;
      console.warn("[marketplace:inventory-sync] skipped non-object product", {
        index,
        correlationId: nextCorrelationId,
      });
      continue;
    }

    const mappedItems = mapProviderProducts(product);
    if (!mappedItems.length) {
      skippedCount += 1;
      console.warn("[marketplace:inventory-sync] skipped product with missing identifier", {
        index,
        correlationId: nextCorrelationId,
        keys: Object.keys(product),
      });
      continue;
    }

    for (const mapped of mappedItems) {
      if (!Number.isFinite(mapped.availableQuantity) || !Number.isFinite(mapped.price)) {
        skippedCount += 1;
        console.warn("[marketplace:inventory-sync] skipped product with invalid numeric fields", {
          index,
          correlationId: nextCorrelationId,
          providerProductId: mapped.providerProductId,
          price: mapped.price,
          availableQuantity: mapped.availableQuantity,
        });
        continue;
      }

      try {
        await MarketplaceProductCache.updateOne(
          { providerProductId: mapped.providerProductId },
          { $set: mapped },
          { upsert: true }
        );
        syncedCount += 1;
      } catch (error) {
        skippedCount += 1;
        console.warn("[marketplace:inventory-sync] failed to persist mapped product", {
          index,
          correlationId: nextCorrelationId,
          providerProductId: mapped.providerProductId,
          message: error.message,
        });
      }
    }
  }

  await publishEvent({
    eventType: "marketplace.inventory.synced",
    source: "marketplace.inventoryProjection",
    correlationId: nextCorrelationId,
    payload: {
      trigger,
      count: syncedCount,
      skippedCount,
    },
  });

  console.info("[marketplace:inventory-sync] completed", {
    trigger,
    correlationId: nextCorrelationId,
    fetchedCount: providerInventory.length,
    syncedCount,
    skippedCount,
  });

  lastSuccessfulSyncAt = Date.now();

  return {
    correlationId: nextCorrelationId,
    syncedCount,
    skippedCount,
  };
};

const upsertMappedProducts = async ({ mappedItems = [] }) => {
  let syncedCount = 0;
  for (const mapped of mappedItems) {
    if (!mapped || !mapped.providerProductId) {
      continue;
    }

    if (!Number.isFinite(mapped.availableQuantity) || !Number.isFinite(mapped.priceEffective || mapped.price)) {
      continue;
    }

    await MarketplaceProductCache.updateOne(
      { providerProductId: mapped.providerProductId },
      { $set: mapped },
      { upsert: true }
    );
    syncedCount += 1;
  }

  return syncedCount;
};

const refreshListingProjectionFromWebhook = async ({
  listingId,
  trigger = "webhook-listing-updated",
  correlationId,
} = {}) => {
  const nextCorrelationId = correlationId || uuidv4();
  const normalizedListingId = toSafeString(listingId, "");

  if (!normalizedListingId) {
    const fallback = await syncInventoryProjection({
      trigger: `${trigger}-missing-listing-id-fallback-full-sync`,
      correlationId: nextCorrelationId,
    });

    return {
      refreshed: false,
      fallbackSync: true,
      reason: "missing-listing-id",
      correlationId: nextCorrelationId,
      ...fallback,
    };
  }

  const listing = await providerClient.fetchProviderListingById({ listingId: normalizedListingId });
  if (!listing) {
    const fallback = await syncInventoryProjection({
      trigger: `${trigger}-listing-not-found-fallback-full-sync`,
      correlationId: nextCorrelationId,
    });

    return {
      refreshed: false,
      fallbackSync: true,
      reason: "listing-not-found",
      listingId: normalizedListingId,
      correlationId: nextCorrelationId,
      ...fallback,
    };
  }

  const mappedItems = mapProviderProducts(listing);
  const syncedCount = await upsertMappedProducts({ mappedItems });

  return {
    refreshed: syncedCount > 0,
    fallbackSync: false,
    listingId: normalizedListingId,
    correlationId: nextCorrelationId,
    syncedCount,
  };
};

const syncInventoryProjectionIfStale = async ({
  trigger = "stale-check",
  maxAgeMs = 30000,
  correlationId,
} = {}) => {
  const now = Date.now();
  if (lastSuccessfulSyncAt && now - lastSuccessfulSyncAt < Number(maxAgeMs || 0)) {
    return {
      skipped: true,
      reason: "fresh-cache",
      lastSuccessfulSyncAt,
    };
  }

  return syncInventoryProjection({ trigger, correlationId });
};

const consolidateProjectedRows = (rows = []) => {
  const results = [];
  const groupedLegacyRows = new Map();
  const seenProviderIds = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const listingType = String(row?.metadata?.listingType || row?.listingType || "single").toLowerCase();

    if (listingType === "group") {
      const providerId = String(row.providerProductId || "");
      if (providerId && !seenProviderIds.has(providerId)) {
        seenProviderIds.add(providerId);
        results.push(row);
      }
      continue;
    }

    if (listingType === "group-variant") {
      const groupId = toSafeString(row?.metadata?.groupId, "");
      if (!groupId) {
        continue;
      }

      if (!groupedLegacyRows.has(groupId)) {
        groupedLegacyRows.set(groupId, {
          providerProductId: groupId,
          sku: null,
          name: toSafeString(row?.metadata?.groupName || row?.name, "Unnamed Product"),
          description: toSafeString(row?.description, ""),
          category: toSafeString(row?.category, "Uncategorized"),
          image: toSafeString(row?.image, ""),
          price: toFiniteNumber(row?.price, 0),
          priceBase: toFiniteNumber(row?.priceBase ?? row?.metadata?.priceBase ?? row?.price, 0),
          priceEffective: toFiniteNumber(row?.priceEffective ?? row?.price, 0),
          discountPercent: toFiniteNumber(row?.discountPercent, 0),
          discountMetadata: row?.discountMetadata || {},
          variantSnapshots: [],
          currency: toSafeString(row?.currency, "NGN") || "NGN",
          availableQuantity: 0,
          isActive: true,
          providerUpdatedAt: toValidDate(row?.providerUpdatedAt || row?.updatedAt),
          metadata: {
            listingType: "group",
            groupId,
            groupName: toSafeString(row?.metadata?.groupName || row?.name, ""),
            variants: [],
          },
          updatedAt: row.updatedAt,
        });
      }

      const grouped = groupedLegacyRows.get(groupId);
      const variantId = toSafeString(row?.providerProductId || row?.metadata?.variantId || row?.metadata?.id, "");
      if (!variantId) {
        continue;
      }

      grouped.metadata.variants.push({
        variantId,
        id: variantId,
        name: toSafeString(row?.metadata?.name || row?.name, variantId),
        sku: toSafeString(row?.sku, "") || null,
        price: toFiniteNumber(row?.price, 0),
        priceBase: toFiniteNumber(row?.priceBase ?? row?.metadata?.priceBase ?? row?.price, 0),
        priceEffective: toFiniteNumber(row?.priceEffective ?? row?.price, 0),
        discountPercent: toFiniteNumber(row?.discountPercent, 0),
        discountMetadata: row?.discountMetadata || {},
        currency: toSafeString(row?.currency, "NGN") || "NGN",
        availableQuantity: toFiniteNumber(row?.availableQuantity, 0),
        image: toSafeString(row?.image, ""),
        images: Array.isArray(row?.metadata?.images) ? row.metadata.images : [],
      });
      grouped.variantSnapshots.push({
        variantId,
        id: variantId,
        name: toSafeString(row?.metadata?.name || row?.name, variantId),
        sku: toSafeString(row?.sku, "") || null,
        price: toFiniteNumber(row?.price, 0),
        priceBase: toFiniteNumber(row?.priceBase ?? row?.metadata?.priceBase ?? row?.price, 0),
        priceEffective: toFiniteNumber(row?.priceEffective ?? row?.price, 0),
        discountPercent: toFiniteNumber(row?.discountPercent, 0),
        discountMetadata: row?.discountMetadata || {},
        currency: toSafeString(row?.currency, "NGN") || "NGN",
        availableQuantity: toFiniteNumber(row?.availableQuantity, 0),
        image: toSafeString(row?.image, ""),
        images: Array.isArray(row?.metadata?.images) ? row.metadata.images : [],
      });

      grouped.availableQuantity += toFiniteNumber(row?.availableQuantity, 0);
      const variantPrice = toFiniteNumber(row?.price, 0);
      if (variantPrice > 0 && (!grouped.price || variantPrice < grouped.price)) {
        grouped.price = variantPrice;
        grouped.priceEffective = toFiniteNumber(row?.priceEffective ?? row?.price, 0);
        grouped.priceBase = toFiniteNumber(row?.priceBase ?? row?.metadata?.priceBase ?? row?.price, 0);
        grouped.discountPercent = toFiniteNumber(row?.discountPercent, 0);
        grouped.discountMetadata = row?.discountMetadata || {};
      }

      if (!grouped.image && row?.image) {
        grouped.image = row.image;
      }
      continue;
    }

    const providerId = String(row.providerProductId || "");
    if (providerId && !seenProviderIds.has(providerId)) {
      seenProviderIds.add(providerId);
      results.push(row);
    }
  }

  for (const groupedRow of groupedLegacyRows.values()) {
    const providerId = String(groupedRow.providerProductId || "");
    if (providerId && !seenProviderIds.has(providerId)) {
      seenProviderIds.add(providerId);
      results.push(groupedRow);
    }
  }

  return results;
};

const getProjectedProducts = async () => {
  const rows = await MarketplaceProductCache.find({ isActive: true }).sort({ updatedAt: -1 }).lean();
  return consolidateProjectedRows(rows);
};

module.exports = {
  syncInventoryProjection,
  syncInventoryProjectionIfStale,
  refreshListingProjectionFromWebhook,
  getProjectedProducts,
  __testables: {
    consolidateProjectedRows,
    normalizeDiscountSnapshot,
    mapProviderProducts,
  },
};
