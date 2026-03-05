const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const CheckoutFallback = require("../models/checkoutFallbackModel");
const User = require("../models/userModel");
const Waitlist = require("../models/waitlistModel");
const AdminCampaign = require("../models/adminCampaignModel");
const CampaignDeliveryLog = require("../models/campaignDeliveryLogModel");
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
const { sendEmailViaResend, sendSmsViaTermii } = require("../services/messaging/providers");
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

  return res.status(200).json(fallback);
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
  const channels = Array.isArray(req.body?.channels) ? req.body.channels : [];
  const audience = req.body?.audience || { scope: "all" };
  const template = req.body?.template || {};

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  if (!channels.length) {
    return res.status(400).json({ message: "At least one channel is required" });
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
      if (channel === "email") {
        if (!recipient.email) {
          await CampaignDeliveryLog.create({
            campaignId,
            recipientKey: recipient.recipientKey,
            recipientType: recipient.recipientType,
            recipientSnapshot: recipient,
            channel,
            status: "skipped",
            provider: "resend",
            payload: {},
            error: { message: "Missing recipient email" },
          });
          continue;
        }

        const subject = renderTemplate(template.subject || "NINO Update", variables);
        const html = renderTemplate(template.emailBody || "", variables);

        try {
          const result = await sendEmailViaResend({
            to: recipient.email,
            subject,
            html,
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
            payload: { subject, html },
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
            provider: "resend",
            payload: { subject, html },
            error: {
              message: error?.message || "Email send failed",
            },
          });
          failed += 1;
        }
      }

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
  sendCampaign,
  listCampaignDeliveryLogs,
};
