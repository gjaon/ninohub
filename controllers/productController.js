const products = require("../data/product");
const { shouldUseProviderProducts } = require("../config/marketplaceConfig");
const {
  getProjectedProducts,
  syncInventoryProjection,
  syncInventoryProjectionIfStale,
} = require("../services/marketplace/inventoryProjectionService");

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
    const effectivePrice = Number(variant?.price?.effective ?? variant?.price ?? 0);
    const originalPrice = Number(variant?.price?.base ?? variant?.originalPrice ?? effectivePrice);
    const discountPercent =
      originalPrice > effectivePrice && originalPrice > 0
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
      originalPrice,
      discountPercent,
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
    product?.metadata?.price?.effective
    ?? product?.price?.effective
    ?? product?.price
    ?? 0
  );
  const originalPrice = Number(
    product?.metadata?.price?.base
    ?? product?.price?.base
    ?? product?.originalPrice
    ?? effectivePrice
  );
  const discountPercent =
    originalPrice > effectivePrice && originalPrice > 0
      ? Math.round(((originalPrice - effectivePrice) / originalPrice) * 100)
      : 0;

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
    originalPrice,
    discountPercent,
    sku: product.sku || null,
    availableQuantity: Number(product.availableQuantity ?? 0),
    customizable: Boolean(product.customizable),
    listingType: product?.metadata?.listingType || product?.listingType || "single",
    listingId: String(product?.metadata?.groupId || product?.providerProductId || product?.id || product?.productId),
    groupName: product?.metadata?.groupName || product?.groupName || null,
    parentGroupId: product?.metadata?.groupId || product?.parentGroupId || null,
    variantId: product?.metadata?.variantId || product?.variantId || null,
    variantName: product?.metadata?.name || product?.variantName || null,
    variants: normalizeVariants(
      Array.isArray(product?.metadata?.variants) ? product.metadata.variants : product?.variants
    ),
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

const getProducts = async (req, res) => {
  const useProviderProducts = shouldUseProviderProducts();
  if (!useProviderProducts) {
    return res.status(200).json(products.map(toFrontendProduct));
  }

  let projected = await getProjectedProducts();

  await syncInventoryProjectionIfStale({
    trigger: "on-demand-products-read-stale-refresh",
    maxAgeMs: Number(process.env.MARKETPLACE_PRODUCTS_SYNC_MAX_AGE_MS || 30000),
  }).catch((error) => {
    console.warn("[products:getProducts] stale refresh skipped", error.message);
  });
  projected = await getProjectedProducts();

  if (!projected.length) {
    await syncInventoryProjection({ trigger: "on-demand-products-read" });
    projected = await getProjectedProducts();
  }

  if (!projected.length) {
    return res.status(502).json({
      message: "Provider inventory is unavailable. No projected products found.",
    });
  }

  return res.status(200).json(projected.map(toFrontendProduct));
};

const getProductById = async (req, res) => {
  const { id } = req.params;
  const useProviderProducts = shouldUseProviderProducts();

  let source;

  if (useProviderProducts) {
    let projected = await getProjectedProducts();
    await syncInventoryProjectionIfStale({
      trigger: "on-demand-product-detail-read-stale-refresh",
      maxAgeMs: Number(process.env.MARKETPLACE_PRODUCTS_SYNC_MAX_AGE_MS || 30000),
    }).catch((error) => {
      console.warn("[products:getProductById] stale refresh skipped", error.message);
    });
    projected = await getProjectedProducts();

    if (!projected.length) {
      await syncInventoryProjection({ trigger: "on-demand-product-detail-read" });
      projected = await getProjectedProducts();
    }
    source = projected.map(toFrontendProduct);
  } else {
    source = products.map(toFrontendProduct);
  }

  const product = source.find((item) => String(item.id) === String(id));

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  res.status(200).json(product);
};

module.exports = {
  getProducts,
  getProductById,
};
