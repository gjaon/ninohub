const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const CheckoutFallback = require("../models/checkoutFallbackModel");
const User = require("../models/userModel");
const Waitlist = require("../models/waitlistModel");
const AdminCampaign = require("../models/adminCampaignModel");
const CampaignDeliveryLog = require("../models/campaignDeliveryLogModel");
const Coupon = require("../models/couponModel");
const {
  appendFallbackNote,
  acquireRetryLock,
  markRetrySuccess,
  markRetryFailure,
  pushHistory,
} = require("../services/marketplace/checkoutFallbackService");
const { finalizeMarketplaceCheckoutByReference } = require("./marketplaceController");
const { publishEvent } = require("../services/marketplace/businessEventBus");
const { renderTemplate, buildRecipientVariables } = require("../services/messaging/templateService");
const { sendSmsViaTermii } = require("../services/messaging/providers");
const {
  generateCouponCode,
  normalizeCouponCode,
  buildDiscountText,
} = require("../services/marketplace/couponService");
const { emitWaitlistCount } = require("../utils/waitlistRealtime");

const parseObjectId = (value) => {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

const buildDateRange = ({ from, to }) => {
  const range = {};
  if (from) {
    const fromDate = new Date(from);
    if (!Number.isNaN(fromDate.getTime())) {
      range.$gte = fromDate;
    }
  }
  if (to) {
    const toDate = new Date(to);
    if (!Number.isNaN(toDate.getTime())) {
      range.$lte = toDate;
    }
  }
  return Object.keys(range).length ? range : null;
};

const formatIsoDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toISOString();
};

const formatCurrency = (value) => {
  const amount = Number(value || 0);
  return `₦${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const toReadableFallbackSections = (fallback = {}) => {
  const lineItems = Array.isArray(fallback.lineItems) ? fallback.lineItems : [];
  const history = Array.isArray(fallback.history) ? fallback.history : [];
  const adminNotes = Array.isArray(fallback.adminNotes) ? fallback.adminNotes : [];
  const unresolvedItems = Array.isArray(fallback.orderIntentSnapshot?.unresolvedItems)
    ? fallback.orderIntentSnapshot.unresolvedItems
    : [];

  return {
    buyerInfo: {
      name: fallback.buyer?.name || "-",
      email: fallback.buyer?.email || "-",
      phone: fallback.buyer?.phone || "-",
      buyerId: fallback.buyer?.id || "-",
    },
    paymentInfo: {
      reference: fallback.paymentReference || fallback.payment?.reference || "-",
      status: fallback.payment?.status || "-",
      amount: formatCurrency(fallback.payment?.amount || fallback.payment?.amountMinor / 100 || 0),
      verifiedAt: formatIsoDate(fallback.payment?.verifiedAt),
      currency: fallback.payment?.currency || "NGN",
    },
    itemsSummary: {
      itemCount: lineItems.length,
      unresolvedItemCount: unresolvedItems.length,
      items: lineItems.map((item) => ({
        productName: item?.productName || "Item",
        quantity: Number(item?.quantity || 0),
        unitPrice: formatCurrency(item?.unitPrice || 0),
      })),
    },
    errorSummary: {
      message: fallback.providerError?.message || "-",
      statusCode: fallback.providerError?.statusCode || "-",
      retryCount: Number(fallback.retryMeta?.count || 0),
      unresolvedItems,
    },
    timeline: history.map((entry) => ({
      action: entry?.action || "-",
      when: formatIsoDate(entry?.occurredAt),
      actor: entry?.actorEmail || "system",
    })),
    adminNotes: adminNotes.map((note) => ({
      note: note?.note || "",
      actor: note?.actorEmail || "-",
      createdAt: formatIsoDate(note?.createdAt),
    })),
  };
};

const buildCouponFilters = (query = {}) => {
  const filters = {};
  const status = String(query.status || "").trim();
  const discountType = String(query.discountType || "").trim();
  const assignedToType = String(query.assignedToType || "").trim();
  const code = String(query.code || "").trim();
  const from = String(query.from || "").trim();
  const to = String(query.to || "").trim();

  if (status) {
    filters.status = status;
  }

  if (discountType) {
    filters.discountType = discountType;
  }

  if (assignedToType) {
    filters.assignedToType = assignedToType;
  }

  if (code) {
    filters.code = { $regex: code, $options: "i" };
  }

  const createdAtRange = buildDateRange({ from, to });
  if (createdAtRange) {
    filters.createdAt = createdAtRange;
  }

  return filters;
};

const buildDiscountConfig = (payload = {}) => {
  const discountType = String(payload.discountType || "").trim();
  const discountValue = Number(payload.discountValue || 0);
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;

  if (!["amount", "percentage"].includes(discountType)) {
    const error = new Error("discountType must be amount or percentage");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    const error = new Error("discountValue must be greater than zero");
    error.statusCode = 400;
    throw error;
  }

  if (discountType === "percentage" && discountValue > 100) {
    const error = new Error("percentage discount cannot exceed 100");
    error.statusCode = 400;
    throw error;
  }

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    const error = new Error("expiresAt must be a valid date");
    error.statusCode = 400;
    throw error;
  }

  return {
    discountType,
    discountValue,
    expiresAt,
  };
};

const generateUniqueCouponCode = async () => {
  for (let attempts = 0; attempts < 8; attempts += 1) {
    const code = generateCouponCode({ prefix: "NINO", length: 8 });
    const exists = await Coupon.exists({ code });
    if (!exists) {
      return code;
    }
  }

  const error = new Error("Unable to generate unique coupon code");
  error.statusCode = 500;
  throw error;
};

const normalizePagination = (query = {}) => {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit || 25)));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const getFallbackQueue = asyncHandler(async (req, res) => {
  const { status, reference, email, from, to } = req.query;
  const query = {};

  if (status) {
    query.status = String(status);
  }

  if (reference) {
    query.paymentReference = { $regex: String(reference).trim(), $options: "i" };
  }

  if (email) {
    query["buyer.email"] = { $regex: String(email).trim(), $options: "i" };
  }

  const createdAtRange = buildDateRange({ from, to });
  if (createdAtRange) {
    query.createdAt = createdAtRange;
  }

  const data = await CheckoutFallback.find(query).sort({ createdAt: -1 }).limit(200).lean();

  return res.status(200).json({
    count: data.length,
    data,
  });
});

const getFallbackById = asyncHandler(async (req, res) => {
  const fallback = await CheckoutFallback.findOne({ fallbackId: req.params.fallbackId }).lean();

  if (!fallback) {
    return res.status(404).json({ message: "Fallback record not found" });
  }

  return res.status(200).json({
    ...fallback,
    readableDetails: toReadableFallbackSections(fallback),
  });
});

const markFallbackReviewed = asyncHandler(async (req, res) => {
  const fallback = await CheckoutFallback.findOneAndUpdate(
    { fallbackId: req.params.fallbackId },
    {
      $set: {
        status: "reviewed",
      },
      $push: {
        history: {
          action: "marked_reviewed",
          actorEmail: req.user.email,
          occurredAt: new Date(),
          metadata: {},
        },
      },
    },
    { new: true }
  );

  if (!fallback) {
    return res.status(404).json({ message: "Fallback record not found" });
  }

  await publishEvent({
    eventType: "admin.fallback.reviewed",
    source: "admin.panel",
    occurredAt: new Date().toISOString(),
    correlationId: fallback.correlationId || null,
    buyerId: parseObjectId(fallback.buyer?.id),
    payload: {
      fallbackId: fallback.fallbackId,
      actorEmail: req.user.email,
    },
  });

  return res.status(200).json({
    message: "Fallback marked reviewed",
    data: fallback,
  });
});

const addFallbackNote = asyncHandler(async (req, res) => {
  const note = String(req.body?.note || "").trim();
  if (!note) {
    return res.status(400).json({ message: "note is required" });
  }

  const fallback = await appendFallbackNote({
    fallbackId: req.params.fallbackId,
    note,
    actorEmail: req.user.email,
  });

  if (!fallback) {
    return res.status(404).json({ message: "Fallback record not found" });
  }

  return res.status(200).json({
    message: "Note added",
    data: fallback,
  });
});

const retryFallbackSubmission = asyncHandler(async (req, res) => {
  const existing = await CheckoutFallback.findOne({ fallbackId: req.params.fallbackId });

  if (!existing) {
    return res.status(404).json({ message: "Fallback record not found" });
  }

  if (["resolved_manual", "resolved_retry"].includes(existing.status)) {
    return res.status(200).json({
      message: "Fallback already resolved",
      data: existing,
      idempotent: true,
    });
  }

  const locked = await acquireRetryLock({
    fallbackId: req.params.fallbackId,
    actorEmail: req.user.email,
  });

  if (!locked) {
    const current = await CheckoutFallback.findOne({ fallbackId: req.params.fallbackId }).lean();
    return res.status(409).json({
      message: "Retry already in progress or resolved",
      data: current,
    });
  }

  try {
    const result = await finalizeMarketplaceCheckoutByReference({
      reference: locked.paymentReference,
      status: "success",
      authenticatedBuyerId: parseObjectId(locked.buyer?.id),
      authenticatedUser: {
        email: locked.buyer?.email,
        name: locked.buyer?.name,
      },
      shippingAddress: locked.shippingAddress || {},
      source: "admin.fallback.retry",
    });

    await markRetrySuccess({
      fallbackId: locked.fallbackId,
      orderId: result?.payload?.order?.orderId || null,
      actorEmail: req.user.email,
    });

    await publishEvent({
      eventType: "admin.fallback.retry_succeeded",
      source: "admin.panel",
      occurredAt: new Date().toISOString(),
      correlationId: locked.correlationId || null,
      buyerId: parseObjectId(locked.buyer?.id),
      payload: {
        fallbackId: locked.fallbackId,
        actorEmail: req.user.email,
        orderId: result?.payload?.order?.orderId || null,
      },
    });

    return res.status(result.statusCode || 200).json({
      message: "Fallback retry completed",
      ...result.payload,
    });
  } catch (error) {
    await markRetryFailure({
      fallbackId: locked.fallbackId,
      error,
      actorEmail: req.user.email,
    });

    await publishEvent({
      eventType: "admin.fallback.retry_failed",
      source: "admin.panel",
      occurredAt: new Date().toISOString(),
      correlationId: locked.correlationId || null,
      buyerId: parseObjectId(locked.buyer?.id),
      payload: {
        fallbackId: locked.fallbackId,
        actorEmail: req.user.email,
        error: {
          message: error?.message || "retry_failed",
          statusCode: error?.statusCode || error?.status || 500,
        },
      },
    });

    return res.status(error.statusCode || 500).json({
      message: error.message || "Retry failed",
      details: error.details || null,
    });
  }
});

const markFallbackResolved = asyncHandler(async (req, res) => {
  const resolutionNote = String(req.body?.resolutionNote || "").trim();

  const fallback = await CheckoutFallback.findOneAndUpdate(
    {
      fallbackId: req.params.fallbackId,
    },
    {
      $set: {
        status: "resolved_manual",
        "retryMeta.inFlight": false,
      },
      $push: {
        history: {
          action: "manually_resolved",
          actorEmail: req.user.email,
          occurredAt: new Date(),
          metadata: {
            resolutionNote: resolutionNote || null,
          },
        },
      },
    },
    { new: true }
  );

  if (!fallback) {
    return res.status(404).json({ message: "Fallback record not found" });
  }

  if (resolutionNote) {
    await appendFallbackNote({
      fallbackId: fallback.fallbackId,
      note: resolutionNote,
      actorEmail: req.user.email,
    });
  }

  await publishEvent({
    eventType: "admin.fallback.resolved_manual",
    source: "admin.panel",
    occurredAt: new Date().toISOString(),
    correlationId: fallback.correlationId || null,
    buyerId: parseObjectId(fallback.buyer?.id),
    payload: {
      fallbackId: fallback.fallbackId,
      actorEmail: req.user.email,
      resolutionNote: resolutionNote || null,
    },
  });

  return res.status(200).json({
    message: "Fallback marked manually resolved",
    data: fallback,
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const { search, segment } = req.query;
  const query = {};

  if (search) {
    const regex = new RegExp(String(search).trim(), "i");
    query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  if (segment === "with_email") {
    query.email = { $exists: true, $ne: "" };
  }

  if (segment === "with_phone") {
    query.phone = { $exists: true, $ne: "" };
  }

  if (segment === "recent_30d") {
    query.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  }

  if (segment === "waitlist_pending" || segment === "waitlist_converted") {
    const waitlistRows = await Waitlist.find({ status: segment.replace("waitlist_", "") })
      .select("email")
      .lean();
    const emails = waitlistRows.map((row) => row.email).filter(Boolean);
    query.email = { $in: emails };
  }

  const users = await User.find(query)
    .select("name email phone createdAt updatedAt")
    .sort({ createdAt: -1 })
    .limit(250)
    .lean();

  return res.status(200).json({
    count: users.length,
    data: users,
  });
});

const listWaitlistAdmin = asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const query = {};

  if (status) {
    query.status = status;
  }

  if (search) {
    const regex = new RegExp(String(search).trim(), "i");
    query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const rows = await Waitlist.find(query).sort({ createdAt: -1 }).limit(400).lean();
  return res.status(200).json({
    count: rows.length,
    data: rows,
  });
});

const updateWaitlistAdminStatus = asyncHandler(async (req, res) => {
  const status = String(req.body?.status || "").trim();
  if (!["pending", "contacted", "converted"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const row = await Waitlist.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );

  if (!row) {
    return res.status(404).json({ message: "Waitlist entry not found" });
  }

  await publishEvent({
    eventType: "admin.waitlist.status_updated",
    source: "admin.panel",
    occurredAt: new Date().toISOString(),
    payload: {
      waitlistId: String(row._id),
      status,
      actorEmail: req.user.email,
    },
  });

  await emitWaitlistCount(req.app.locals.io);

  return res.status(200).json({
    message: "Waitlist status updated",
    data: row,
  });
});

const generateWaitlistCoupons = asyncHandler(async (req, res) => {
  const { dryRun = false, status, search } = req.body || {};
  const { discountType, discountValue, expiresAt } = buildDiscountConfig(req.body || {});

  const query = {};
  if (status && ["pending", "contacted", "converted"].includes(String(status))) {
    query.status = String(status);
  }
  if (search) {
    const regex = new RegExp(String(search).trim(), "i");
    query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const waitlistRows = await Waitlist.find(query)
    .select("name email phone status")
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  if (dryRun) {
    return res.status(200).json({
      message: "Dry run completed",
      summary: {
        requested: waitlistRows.length,
        generated: 0,
        skipped: 0,
        failed: 0,
      },
      preview: waitlistRows.slice(0, 20).map((row) => ({
        assignedToType: "waitlist",
        assignedToRef: row._id,
        email: row.email || null,
        phone: row.phone || null,
        name: row.name || null,
      })),
    });
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const createdCoupons = [];

  for (const row of waitlistRows) {
    try {
      const existingActive = await Coupon.findOne({
        assignedToType: "waitlist",
        assignedToRef: row._id,
        status: "active",
      }).select("code");

      if (existingActive) {
        skipped += 1;
        continue;
      }

      const code = await generateUniqueCouponCode();
      const coupon = await Coupon.create({
        code,
        discountType,
        discountValue,
        currency: "NGN",
        status: "active",
        assignedToType: "waitlist",
        assignedToRef: row._id,
        assignedEmail: row.email || null,
        assignedPhone: row.phone || null,
        createdByAdminEmail: req.user.email,
        expiresAt: expiresAt || null,
      });

      createdCoupons.push(coupon);
      generated += 1;
    } catch (_error) {
      failed += 1;
    }
  }

  return res.status(201).json({
    message: "Waitlist coupons generated",
    summary: {
      requested: waitlistRows.length,
      generated,
      skipped,
      failed,
    },
    coupons: createdCoupons.map((coupon) => ({
      code: coupon.code,
      status: coupon.status,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      assignedToType: coupon.assignedToType,
      assignedToRef: coupon.assignedToRef,
      assignedPhone: coupon.assignedPhone,
      assignedEmail: coupon.assignedEmail,
      expiresAt: coupon.expiresAt,
      createdAt: coupon.createdAt,
    })),
  });
});

const generateUserCoupons = asyncHandler(async (req, res) => {
  const { dryRun = false, userIds = [], search, segment } = req.body || {};
  const { discountType, discountValue, expiresAt } = buildDiscountConfig(req.body || {});

  const query = {};
  if (Array.isArray(userIds) && userIds.length) {
    query._id = {
      $in: userIds
        .map((value) => parseObjectId(value))
        .filter(Boolean),
    };
  }

  if (search) {
    const regex = new RegExp(String(search).trim(), "i");
    query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  if (segment === "with_phone") {
    query.phone = { $exists: true, $ne: "" };
  }

  if (segment === "recent_30d") {
    query.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  }

  const users = await User.find(query).select("name email phone").sort({ createdAt: -1 }).limit(1000).lean();

  if (dryRun) {
    return res.status(200).json({
      message: "Dry run completed",
      summary: {
        requested: users.length,
        generated: 0,
        skipped: 0,
        failed: 0,
      },
      preview: users.slice(0, 20).map((row) => ({
        assignedToType: "user",
        assignedToRef: row._id,
        email: row.email || null,
        phone: row.phone || null,
        name: row.name || null,
      })),
    });
  }

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const createdCoupons = [];

  for (const user of users) {
    try {
      const existingActive = await Coupon.findOne({
        assignedToType: "user",
        assignedToRef: user._id,
        status: "active",
      }).select("code");

      if (existingActive) {
        skipped += 1;
        continue;
      }

      const code = await generateUniqueCouponCode();
      const coupon = await Coupon.create({
        code,
        discountType,
        discountValue,
        currency: "NGN",
        status: "active",
        assignedToType: "user",
        assignedToRef: user._id,
        assignedEmail: user.email || null,
        assignedPhone: user.phone || null,
        createdByAdminEmail: req.user.email,
        expiresAt: expiresAt || null,
      });

      createdCoupons.push(coupon);
      generated += 1;
    } catch (_error) {
      failed += 1;
    }
  }

  return res.status(201).json({
    message: "User coupons generated",
    summary: {
      requested: users.length,
      generated,
      skipped,
      failed,
    },
    coupons: createdCoupons.map((coupon) => ({
      code: coupon.code,
      status: coupon.status,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      assignedToType: coupon.assignedToType,
      assignedToRef: coupon.assignedToRef,
      assignedPhone: coupon.assignedPhone,
      assignedEmail: coupon.assignedEmail,
      expiresAt: coupon.expiresAt,
      createdAt: coupon.createdAt,
    })),
  });
});

const listCoupons = asyncHandler(async (req, res) => {
  const filters = buildCouponFilters(req.query);
  const { page, limit, skip } = normalizePagination(req.query);

  const [data, total] = await Promise.all([
    Coupon.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Coupon.countDocuments(filters),
  ]);

  return res.status(200).json({
    page,
    limit,
    total,
    count: data.length,
    data,
  });
});

const revokeCoupon = asyncHandler(async (req, res) => {
  const code = normalizeCouponCode(req.params.code);
  const coupon = await Coupon.findOneAndUpdate(
    {
      code,
      status: "active",
    },
    {
      $set: {
        status: "revoked",
      },
    },
    { new: true }
  ).lean();

  if (!coupon) {
    return res.status(404).json({ message: "Active coupon not found" });
  }

  return res.status(200).json({
    message: "Coupon revoked",
    data: coupon,
  });
});

const sendCouponSms = asyncHandler(async (req, res) => {
  const smsBody = String(req.body?.template?.smsBody || req.body?.smsBody || "").trim();
  if (!smsBody) {
    return res.status(400).json({ message: "SMS template is required" });
  }

  const couponCodes = Array.isArray(req.body?.couponCodes)
    ? req.body.couponCodes.map((code) => normalizeCouponCode(code)).filter(Boolean)
    : [];

  const filters = couponCodes.length
    ? { code: { $in: couponCodes } }
    : {
        ...buildCouponFilters(req.body?.filters || {}),
        status: "active",
      };

  const coupons = await Coupon.find(filters).sort({ assignedToType: 1, createdAt: -1 }).limit(2000).lean();

  const orderedCoupons = coupons.sort((left, right) => {
    const rank = { waitlist: 0, user: 1, manual: 2 };
    return (rank[left.assignedToType] ?? 3) - (rank[right.assignedToType] ?? 3);
  });

  const campaignId = new mongoose.Types.ObjectId().toString();
  await AdminCampaign.create({
    campaignId,
    name: String(req.body?.name || "Coupon SMS").trim() || "Coupon SMS",
    channels: ["sms"],
    audience: {
      scope: "coupons",
      filters,
    },
    template: {
      smsBody,
    },
    status: "running",
    actorEmail: req.user.email,
    totals: {
      recipients: orderedCoupons.length,
      sent: 0,
      failed: 0,
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const coupon of orderedCoupons) {
    const recipientPhone = String(coupon.assignedPhone || "").trim();
    const recipientEmail = String(coupon.assignedEmail || "").trim();

    let recipientName = "";
    if (coupon.assignedToType === "user" && coupon.assignedToRef) {
      const user = await User.findById(coupon.assignedToRef).select("name").lean();
      recipientName = user?.name || "";
    }

    if (coupon.assignedToType === "waitlist" && coupon.assignedToRef) {
      const waitlist = await Waitlist.findById(coupon.assignedToRef).select("name").lean();
      recipientName = waitlist?.name || "";
    }

    const variables = {
      ...buildRecipientVariables({
        name: recipientName,
        phone: recipientPhone,
        email: recipientEmail,
      }),
      couponCode: coupon.code,
      discountText: buildDiscountText({
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        currency: coupon.currency,
      }),
      expiryDate: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 10) : "",
    };

    if (!recipientPhone) {
      skipped += 1;
      await CampaignDeliveryLog.create({
        campaignId,
        recipientKey: `coupon:${coupon.code}`,
        recipientType: coupon.assignedToType === "waitlist" ? "waitlist" : "user",
        recipientSnapshot: {
          assignedToType: coupon.assignedToType,
          assignedToRef: coupon.assignedToRef,
          phone: recipientPhone || null,
          email: recipientEmail || null,
          couponCode: coupon.code,
        },
        channel: "sms",
        status: "skipped",
        provider: "termii",
        payload: {},
        error: { message: "Missing recipient phone" },
      });
      continue;
    }

    const message = renderTemplate(smsBody, variables);

    try {
      const result = await sendSmsViaTermii({
        to: recipientPhone,
        message,
      });

      sent += 1;
      await CampaignDeliveryLog.create({
        campaignId,
        recipientKey: `coupon:${coupon.code}`,
        recipientType: coupon.assignedToType === "waitlist" ? "waitlist" : "user",
        recipientSnapshot: {
          assignedToType: coupon.assignedToType,
          assignedToRef: coupon.assignedToRef,
          phone: recipientPhone,
          email: recipientEmail || null,
          couponCode: coupon.code,
        },
        channel: "sms",
        status: "sent",
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        payload: {
          message,
        },
        sentAt: new Date(),
      });
    } catch (error) {
      failed += 1;
      await CampaignDeliveryLog.create({
        campaignId,
        recipientKey: `coupon:${coupon.code}`,
        recipientType: coupon.assignedToType === "waitlist" ? "waitlist" : "user",
        recipientSnapshot: {
          assignedToType: coupon.assignedToType,
          assignedToRef: coupon.assignedToRef,
          phone: recipientPhone,
          email: recipientEmail || null,
          couponCode: coupon.code,
        },
        channel: "sms",
        status: "failed",
        provider: "termii",
        payload: {
          message,
        },
        error: {
          message: error?.message || "SMS send failed",
        },
      });
    }
  }

  await AdminCampaign.updateOne(
    { campaignId },
    {
      $set: {
        status: "completed",
        totals: {
          recipients: orderedCoupons.length,
          sent,
          failed,
          skipped,
        },
      },
    }
  );

  return res.status(201).json({
    message: "Coupon SMS processed",
    campaignId,
    summary: {
      requested: orderedCoupons.length,
      generated: orderedCoupons.length,
      skipped,
      failed,
      sent,
    },
  });
});

const buildRecipients = async ({ audience = {} }) => {
  const scope = String(audience.scope || "all");
  const query = String(audience.query || "").trim();
  const waitlistStatus = String(audience.waitlistStatus || "").trim();
  const userSegment = String(audience.userSegment || "").trim();

  let users = [];
  let waitlist = [];

  const userQuery = {};
  if (query) {
    const regex = new RegExp(query, "i");
    userQuery.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  if (userSegment === "recent_30d") {
    userQuery.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  }

  if (scope === "all" || scope === "users") {
    users = await User.find(userQuery).select("name email phone").lean();
  }

  const waitlistQuery = {};
  if (query) {
    const regex = new RegExp(query, "i");
    waitlistQuery.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }
  if (waitlistStatus && ["pending", "contacted", "converted"].includes(waitlistStatus)) {
    waitlistQuery.status = waitlistStatus;
  }

  if (scope === "all" || scope === "waitlist") {
    waitlist = await Waitlist.find(waitlistQuery).select("name email phone status").lean();
  }

  const byKey = new Map();

  users.forEach((user) => {
    const key = `user:${user._id}`;
    byKey.set(key, {
      recipientKey: key,
      recipientType: "user",
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
    });
  });

  waitlist.forEach((entry) => {
    const key = `waitlist:${entry._id}`;
    byKey.set(key, {
      recipientKey: key,
      recipientType: "waitlist",
      name: entry.name || "",
      email: entry.email || "",
      phone: entry.phone || "",
      waitlistStatus: entry.status,
    });
  });

  return Array.from(byKey.values());
};

const sendCampaign = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const channels = ["sms"];
  const audience = req.body?.audience || { scope: "all" };
  const template = req.body?.template || {};

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  if (!String(template.smsBody || "").trim()) {
    return res.status(400).json({ message: "template.smsBody is required" });
  }

  const recipients = await buildRecipients({ audience });

  const campaignId = new mongoose.Types.ObjectId().toString();
  const campaign = await AdminCampaign.create({
    campaignId,
    name,
    channels,
    audience,
    template,
    status: "running",
    actorEmail: req.user.email,
    totals: {
      recipients: recipients.length,
      sent: 0,
      failed: 0,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const variables = buildRecipientVariables(recipient);

    for (const channel of channels) {
      if (channel === "sms") {
        if (!recipient.phone) {
          await CampaignDeliveryLog.create({
            campaignId,
            recipientKey: recipient.recipientKey,
            recipientType: recipient.recipientType,
            recipientSnapshot: recipient,
            channel,
            status: "skipped",
            provider: "termii",
            payload: {},
            error: { message: "Missing recipient phone" },
          });
          continue;
        }

        const message = renderTemplate(template.smsBody || "", variables);

        try {
          const result = await sendSmsViaTermii({
            to: recipient.phone,
            message,
          });

          await CampaignDeliveryLog.create({
            campaignId,
            recipientKey: recipient.recipientKey,
            recipientType: recipient.recipientType,
            recipientSnapshot: recipient,
            channel,
            status: "sent",
            provider: result.provider,
            providerMessageId: result.providerMessageId,
            payload: { message },
            sentAt: new Date(),
          });
          sent += 1;
        } catch (error) {
          await CampaignDeliveryLog.create({
            campaignId,
            recipientKey: recipient.recipientKey,
            recipientType: recipient.recipientType,
            recipientSnapshot: recipient,
            channel,
            status: "failed",
            provider: "termii",
            payload: { message },
            error: {
              message: error?.message || "SMS send failed",
            },
          });
          failed += 1;
        }
      }
    }
  }

  campaign.status = failed > 0 ? "completed" : "completed";
  campaign.totals = {
    recipients: recipients.length,
    sent,
    failed,
  };
  await campaign.save();

  await publishEvent({
    eventType: "admin.campaign.sent",
    source: "admin.panel",
    occurredAt: new Date().toISOString(),
    payload: {
      campaignId,
      actorEmail: req.user.email,
      channels,
      recipients: recipients.length,
      sent,
      failed,
    },
  });

  return res.status(201).json({
    message: "Campaign processed",
    campaign,
  });
});

const listCampaignDeliveryLogs = asyncHandler(async (req, res) => {
  const { campaignId, status, channel } = req.query;
  const query = {};

  if (campaignId) query.campaignId = campaignId;
  if (status) query.status = status;
  if (channel) query.channel = channel;

  const rows = await CampaignDeliveryLog.find(query).sort({ createdAt: -1 }).limit(500).lean();

  return res.status(200).json({
    count: rows.length,
    data: rows,
  });
});

module.exports = {
  getFallbackQueue,
  getFallbackById,
  markFallbackReviewed,
  addFallbackNote,
  retryFallbackSubmission,
  markFallbackResolved,
  listUsers,
  listWaitlistAdmin,
  updateWaitlistAdminStatus,
  generateWaitlistCoupons,
  generateUserCoupons,
  listCoupons,
  revokeCoupon,
  sendCouponSms,
  sendCampaign,
  listCampaignDeliveryLogs,
  __testables: {
    toReadableFallbackSections,
  },
};
