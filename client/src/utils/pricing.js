// Pricing utility functions for quantity-based discounts

const parseNumeric = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value
      .replace(/,/g, "")
      .replace(/%/g, "")
      .replace(/[^0-9.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveOriginalPrice = (product = {}) => {
  const currentPrice = parseNumeric(product?.price, 0);
  const explicitOriginalPrice = parseNumeric(
    product?.originalPrice
      ?? product?.compareAtPrice
      ?? product?.basePrice,
    0
  );

  if (explicitOriginalPrice > 0) {
    return explicitOriginalPrice;
  }

  const discountPercent = parseNumeric(product?.discountPercent, 0);
  if (discountPercent > 0 && discountPercent < 100 && currentPrice > 0) {
    return currentPrice / (1 - (discountPercent / 100));
  }

  return currentPrice;
};

export const getProductDiscountPercent = (product = {}) => {
  const explicitDiscountPercent = parseNumeric(product?.discountPercent, 0);
  if (Number.isFinite(explicitDiscountPercent) && explicitDiscountPercent > 0) {
    return Math.round(explicitDiscountPercent);
  }

  const originalPrice = parseNumeric(
    product?.originalPrice
    ?? product?.compareAtPrice
    ?? product?.basePrice,
    0
  );
  const currentPrice = parseNumeric(product?.price, 0);

  if (
    Number.isFinite(originalPrice)
    && Number.isFinite(currentPrice)
    && originalPrice > 0
    && originalPrice > currentPrice
  ) {
    return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  return 0;
};

/**
 * Calculate the discounted price based on quantity
 * @param {number} basePrice - Original price per item
 * @param {number} quantity - Number of items
 * @param {object} options - Optional pricing behavior
 * @returns {object} - { unitPrice, totalPrice, discount, discountPercent }
 */
export const calculatePrice = (basePrice, quantity, options = {}) => {
  const { disableBulkDiscount = false } = options;
  let discountPercent = 0;

  // Discount tiers
  if (!disableBulkDiscount && quantity >= 10) {
    discountPercent = 15; // 15% off for 10+ items
  } else if (!disableBulkDiscount && quantity >= 5) {
    discountPercent = 10; // 10% off for 5-9 items
  } else if (!disableBulkDiscount && quantity >= 3) {
    discountPercent = 5; // 5% off for 3-4 items
  }

  const discount = (basePrice * discountPercent) / 100;
  const unitPrice = basePrice - discount;
  const totalPrice = unitPrice * quantity;

  return {
    unitPrice: parseFloat(unitPrice.toFixed(2)),
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    discountPercent,
  };
};

/**
 * Get discount tier information
 * @param {number} quantity - Current quantity
 * @returns {object} - Information about current and next discount tiers
 */
export const getDiscountInfo = (quantity) => {
  const tiers = [
    { min: 10, discount: 15, label: "10+ items: 15% off" },
    { min: 5, discount: 10, label: "5-9 items: 10% off" },
    { min: 3, discount: 5, label: "3-4 items: 5% off" },
  ];

  const currentTier = tiers.find((tier) => quantity >= tier.min);
  const nextTier = tiers.find((tier) => quantity < tier.min);

  return {
    currentTier,
    nextTier,
    allTiers: tiers,
  };
};
