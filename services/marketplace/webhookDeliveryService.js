const { v4: uuidv4 } = require("uuid");
const MarketplaceWebhookDelivery = require("../../models/marketplaceWebhookDeliveryModel");
const { getMarketplaceConfig } = require("../../config/marketplaceConfig");

const computeNextAttemptAt = (attempt) => {
  const { webhookRetryBaseDelayMs } = getMarketplaceConfig();
  return new Date(Date.now() + webhookRetryBaseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
};

const recordInboundDelivery = async ({ provider, eventId, reference, signatureVerified, payload }) => {
  const existing = await MarketplaceWebhookDelivery.findOne({ provider, eventId });
  if (existing) {
    return {
      duplicate: true,
      delivery: existing,
    };
  }

  const delivery = await MarketplaceWebhookDelivery.create({
    deliveryId: uuidv4(),
    provider,
    eventId,
    reference: reference || null,
    signatureVerified,
    payload,
    status: "received",
    attempts: 0,
  });

  return {
    duplicate: false,
    delivery,
  };
};

const markProcessing = async (deliveryId) => {
  return MarketplaceWebhookDelivery.findOneAndUpdate(
    { deliveryId },
    {
      $set: {
        status: "processing",
      },
      $inc: {
        attempts: 1,
      },
    },
    { new: true }
  );
};

const markProcessed = async (deliveryId) => {
  return MarketplaceWebhookDelivery.findOneAndUpdate(
    { deliveryId },
    {
      $set: {
        status: "processed",
        processedAt: new Date(),
        nextAttemptAt: null,
        lastError: null,
      },
    },
    { new: true }
  );
};

const markRetryOrExhausted = async ({ deliveryId, errorMessage }) => {
  const { webhookRetryMaxAttempts } = getMarketplaceConfig();
  const delivery = await MarketplaceWebhookDelivery.findOne({ deliveryId });
  if (!delivery) {
    return null;
  }

  const exhausted = delivery.attempts >= webhookRetryMaxAttempts;

  delivery.lastError = errorMessage;
  delivery.status = exhausted ? "exhausted" : "retrying";
  delivery.nextAttemptAt = exhausted ? null : computeNextAttemptAt(delivery.attempts);
  await delivery.save();

  return delivery;
};

module.exports = {
  computeNextAttemptAt,
  recordInboundDelivery,
  markProcessing,
  markProcessed,
  markRetryOrExhausted,
};
