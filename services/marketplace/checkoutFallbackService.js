const { v4: uuidv4 } = require("uuid");
const CheckoutFallback = require("../../models/checkoutFallbackModel");

const pushHistory = async ({ fallbackId, action, actorEmail, metadata }) =>
  CheckoutFallback.findOneAndUpdate(
    { fallbackId },
    {
      $push: {
        history: {
          action,
          actorEmail: actorEmail || null,
          metadata: metadata || {},
          occurredAt: new Date(),
        },
      },
    },
    { new: true }
  );

const createOrUpdateFallback = async ({
  hold,
  paymentReference,
  buyer,
  payment,
  shippingAddress,
  lineItems,
  providerError,
  orderIntentSnapshot,
}) => {
  const existing = await CheckoutFallback.findOne({ paymentReference });

  const updatePayload = {
    holdId: hold.holdId,
    paymentReference,
    buyer: buyer || {},
    payment: payment || {},
    holdSnapshot: {
      holdId: hold.holdId,
      status: hold.status,
      paymentStatus: hold.paymentStatus,
      amount: hold.amount,
      currency: hold.currency,
      pricingBreakdown: hold.pricingBreakdown,
      expiresAt: hold.expiresAt,
      createdAt: hold.createdAt,
      updatedAt: hold.updatedAt,
    },
    orderIntentSnapshot: orderIntentSnapshot || {},
    shippingAddress: shippingAddress || {},
    lineItems: Array.isArray(lineItems) ? lineItems : [],
    correlationId: hold.correlationId || null,
    idempotencyKey: hold.idempotencyKey || null,
    providerError: providerError || {},
  };

  if (!existing) {
    return CheckoutFallback.create({
      fallbackId: uuidv4(),
      status: "pending",
      retryMeta: {
        count: 0,
        inFlight: false,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
      },
      history: [
        {
          action: "fallback_created",
          occurredAt: new Date(),
          metadata: {
            reason: providerError?.message || "provider_submission_failed",
          },
        },
      ],
      ...updatePayload,
    });
  }

  return CheckoutFallback.findOneAndUpdate(
    { paymentReference },
    {
      $set: {
        ...updatePayload,
        status: ["resolved", "resolved_manual", "resolved_retry"].includes(existing.status)
          ? existing.status
          : "pending",
      },
      $push: {
        history: {
          action: "fallback_updated",
          occurredAt: new Date(),
          metadata: {
            reason: providerError?.message || "provider_submission_failed",
          },
        },
      },
    },
    { new: true }
  );
};

const appendFallbackNote = async ({ fallbackId, note, actorEmail }) =>
  CheckoutFallback.findOneAndUpdate(
    { fallbackId },
    {
      $push: {
        adminNotes: {
          note,
          actorEmail: actorEmail || null,
          createdAt: new Date(),
        },
        history: {
          action: "admin_note_added",
          actorEmail: actorEmail || null,
          metadata: { note },
          occurredAt: new Date(),
        },
      },
    },
    { new: true }
  );

const acquireRetryLock = async ({ fallbackId, actorEmail }) => {
  const now = new Date();

  return CheckoutFallback.findOneAndUpdate(
    {
      fallbackId,
      status: { $nin: ["resolved", "resolved_manual", "resolved_retry"] },
      $or: [{ "retryMeta.inFlight": { $exists: false } }, { "retryMeta.inFlight": false }],
    },
    {
      $set: {
        status: "retrying",
        "retryMeta.inFlight": true,
        "retryMeta.lastAttemptAt": now,
      },
      $inc: {
        "retryMeta.count": 1,
      },
      $push: {
        history: {
          action: "retry_started",
          actorEmail: actorEmail || null,
          occurredAt: now,
          metadata: {},
        },
      },
    },
    { new: true }
  );
};

const markRetrySuccess = async ({ fallbackId, orderId, actorEmail }) =>
  CheckoutFallback.findOneAndUpdate(
    { fallbackId },
    {
      $set: {
        status: "resolved_retry",
        resolvedOrderId: orderId || null,
        "retryMeta.inFlight": false,
        "retryMeta.lastSuccessAt": new Date(),
      },
      $push: {
        history: {
          action: "retry_succeeded",
          actorEmail: actorEmail || null,
          occurredAt: new Date(),
          metadata: {
            orderId: orderId || null,
          },
        },
      },
    },
    { new: true }
  );

const markRetryFailure = async ({ fallbackId, error, actorEmail }) =>
  CheckoutFallback.findOneAndUpdate(
    { fallbackId },
    {
      $set: {
        status: "failed",
        providerError: {
          message: error?.message || "retry_failed",
          statusCode: error?.statusCode || error?.status || null,
          details: error?.details || null,
        },
        "retryMeta.inFlight": false,
        "retryMeta.lastFailureAt": new Date(),
      },
      $push: {
        history: {
          action: "retry_failed",
          actorEmail: actorEmail || null,
          occurredAt: new Date(),
          metadata: {
            message: error?.message || "retry_failed",
            statusCode: error?.statusCode || error?.status || null,
          },
        },
      },
    },
    { new: true }
  );

module.exports = {
  createOrUpdateFallback,
  appendFallbackNote,
  acquireRetryLock,
  markRetrySuccess,
  markRetryFailure,
  pushHistory,
};
