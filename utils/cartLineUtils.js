const toMonetaryNumber = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/\s+/g, "")
      .replace(/,/g, "")
      .replace(/NGN/gi, "")
      .replace(/₦/g, "")
      .replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildLineKey = (productId, variantId = "") => {
  const normalizedProductId = String(productId || "").trim();
  const normalizedVariantId = String(variantId || "").trim();
  return `${normalizedProductId}::${normalizedVariantId}`;
};

const hasRequiredVariantSelection = (product = {}) => {
  const listingType = String(product?.listingType || "single").toLowerCase();
  if (listingType !== "group") {
    return true;
  }

  return Boolean(String(product?.variantId || "").trim());
};

const getLineIdentityFromPayload = (payload = {}) => {
  const productId = String(payload?.productId || "").trim();
  const variantId = String(payload?.variantId || "").trim();
  const lineKey = String(payload?.lineKey || buildLineKey(productId, variantId)).trim();
  return {
    productId,
    variantId,
    lineKey,
  };
};

const findCartItemIndex = (items = [], identity = {}) => {
  const lineKey = String(identity?.lineKey || "").trim();
  const productId = String(identity?.productId || "").trim();
  const variantId = String(identity?.variantId || "").trim();

  const byLineKeyIndex = lineKey
    ? items.findIndex((item) => String(item?.lineKey || "") === lineKey)
    : -1;
  if (byLineKeyIndex >= 0) {
    return byLineKeyIndex;
  }

  const byProductAndVariant = items.findIndex(
    (item) =>
      String(item?.productId || "") === productId
      && String(item?.variantId || "") === variantId
  );
  if (byProductAndVariant >= 0) {
    return byProductAndVariant;
  }

  if (!variantId) {
    return items.findIndex((item) => String(item?.productId || "") === productId);
  }

  return -1;
};

const recalculateCartTotals = (cart) => {
  cart.totalItems = cart.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  cart.totalPrice = cart.items.reduce(
    (sum, item) => sum + toMonetaryNumber(item.price, 0) * Number(item.quantity || 0),
    0
  );
};

const applyVariantSwitch = ({
  items = [],
  currentIdentity = {},
  nextVariantId = "",
  nextVariantName = null,
  nextPrice,
  nextImage = "",
}) => {
  const currentIndex = findCartItemIndex(items, currentIdentity);
  if (currentIndex < 0) {
    return { changed: false, items };
  }

  const currentItem = items[currentIndex];
  const normalizedNextVariantId = String(nextVariantId || "").trim();
  const nextLineKey = buildLineKey(currentItem.productId, normalizedNextVariantId);

  const destinationIndex = findCartItemIndex(items, {
    lineKey: nextLineKey,
    productId: currentItem.productId,
    variantId: normalizedNextVariantId,
  });

  const normalizedPrice = toMonetaryNumber(nextPrice, NaN);

  if (destinationIndex >= 0 && destinationIndex !== currentIndex) {
    const destinationItem = items[destinationIndex];
    destinationItem.quantity = Number(destinationItem.quantity || 0) + Number(currentItem.quantity || 0);
    if (Number.isFinite(normalizedPrice) && normalizedPrice >= 0) {
      destinationItem.price = normalizedPrice;
    }
    destinationItem.variantId = normalizedNextVariantId || null;
    destinationItem.variantName = nextVariantName;
    destinationItem.selectedImage = nextImage || destinationItem.selectedImage || destinationItem.image;
    destinationItem.image = nextImage || destinationItem.image;
    destinationItem.lineKey = nextLineKey;
    items.splice(currentIndex, 1);
    return { changed: true, items };
  }

  currentItem.variantId = normalizedNextVariantId || null;
  currentItem.variantName = nextVariantName;
  if (Number.isFinite(normalizedPrice) && normalizedPrice >= 0) {
    currentItem.price = normalizedPrice;
  }
  currentItem.selectedImage = nextImage || currentItem.selectedImage || currentItem.image;
  currentItem.image = nextImage || currentItem.image;
  currentItem.lineKey = nextLineKey;

  return { changed: true, items };
};

module.exports = {
  toMonetaryNumber,
  buildLineKey,
  hasRequiredVariantSelection,
  getLineIdentityFromPayload,
  findCartItemIndex,
  recalculateCartTotals,
  applyVariantSwitch,
};
