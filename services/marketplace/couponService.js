const Coupon = require("../../models/couponModel");
const Waitlist = require("../../models/waitlistModel");

const toMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const normalizeCouponCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const normalizePhone = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^\d+]/g, "");

const isCouponExpired = (coupon) =>
  Boolean(coupon?.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now());

const buildDiscountText = ({ discountType, discountValue, currency = "NGN" }) => {
  const value = Number(discountValue || 0);
  if (discountType === "percentage") {
    return `${value}% off`;
  }

  const amount = `₦${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
  return currency === "NGN" ? `${amount} off` : `${amount} ${currency} off`;
};

const computeCouponDiscount = ({ discountType, discountValue, subtotal }) => {
  const normalizedSubtotal = toMoney(subtotal);
  if (normalizedSubtotal <= 0) {
    return 0;
  }

  let discount = 0;
  if (discountType === "percentage") {
    discount = toMoney((normalizedSubtotal * Number(discountValue || 0)) / 100);
  } else {
    discount = toMoney(discountValue);
  }

  if (!Number.isFinite(discount) || discount <= 0) {
    return 0;
  }

  return Math.min(discount, normalizedSubtotal);
};

const ensureCouponEligibility = async ({ coupon, buyerId, email, phone }) => {
  const buyerIdStr = String(buyerId || "");
  const assignedRefStr = String(coupon?.assignedToRef || "");
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  const assignedEmail = String(coupon?.assignedEmail || "").trim().toLowerCase();
  const assignedPhone = normalizePhone(coupon?.assignedPhone);

  if (coupon.assignedToType === "user") {
    if (!assignedRefStr || !buyerIdStr || assignedRefStr !== buyerIdStr) {
      const error = new Error("Coupon is not assigned to this user");
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (coupon.assignedToType === "waitlist") {
    const directIdentityMatch =
      (assignedEmail && normalizedEmail && assignedEmail === normalizedEmail)
      || (assignedPhone && normalizedPhone && assignedPhone === normalizedPhone)
      || (assignedRefStr && buyerIdStr && assignedRefStr === buyerIdStr);

    if (directIdentityMatch) {
      return;
    }

    if (assignedRefStr) {
      const waitlistRow = await Waitlist.findById(assignedRefStr).select("email phone").lean();
      const waitlistEmail = String(waitlistRow?.email || "").trim().toLowerCase();
      const waitlistPhone = normalizePhone(waitlistRow?.phone);

      const waitlistMatch =
        (waitlistEmail && normalizedEmail && waitlistEmail === normalizedEmail)
        || (waitlistPhone && normalizedPhone && waitlistPhone === normalizedPhone);

      if (waitlistMatch) {
        return;
      }
    }

    const error = new Error("Coupon is not eligible for this checkout");
    error.statusCode = 403;
    throw error;
  }
};

const validateCouponForCheckout = async ({
  couponCode,
  buyerId,
  shippingAddress,
  subtotal,
}) => {
  const code = normalizeCouponCode(couponCode);
  if (!code) {
    return null;
  }

  const coupon = await Coupon.findOne({ code }).lean();
  if (!coupon) {
    const error = new Error("Coupon code is invalid");
    error.statusCode = 400;
    throw error;
  }

  if (coupon.status !== "active") {
    const error = new Error("Coupon is no longer active");
    error.statusCode = 400;
    throw error;
  }

  if (isCouponExpired(coupon)) {
    const error = new Error("Coupon has expired");
    error.statusCode = 400;
    throw error;
  }

  await ensureCouponEligibility({
    coupon,
    buyerId,
    email: shippingAddress?.email,
    phone: shippingAddress?.phone,
  });

  const appliedDiscount = computeCouponDiscount({
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    subtotal,
  });

  return {
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    currency: coupon.currency || "NGN",
    status: coupon.status,
    expiresAt: coupon.expiresAt || null,
    assignedToType: coupon.assignedToType,
    assignedToRef: coupon.assignedToRef || null,
    appliedDiscount,
  };
};

const generateCouponCode = ({ prefix = "NINO", length = 8 } = {}) => {
  const randomPart = Math.random()
    .toString(36)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, Math.max(4, Number(length || 8)));

  return `${String(prefix || "NINO").toUpperCase()}-${randomPart}`;
};

module.exports = {
  normalizeCouponCode,
  normalizePhone,
  isCouponExpired,
  buildDiscountText,
  computeCouponDiscount,
  validateCouponForCheckout,
  generateCouponCode,
};
