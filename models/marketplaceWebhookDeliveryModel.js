const mongoose = require("mongoose");

const marketplaceWebhookDeliverySchema = mongoose.Schema(
  {
    deliveryId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["provider", "paystack"],
      index: true,
    },
    eventId: {
      type: String,
      required: true,
      index: true,
    },
    reference: {
      type: String,
      default: null,
      index: true,
    },
    signatureVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["received", "processing", "retrying", "processed", "failed", "exhausted"],
      default: "received",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: null,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastError: {
      type: String,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

marketplaceWebhookDeliverySchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("MarketplaceWebhookDelivery", marketplaceWebhookDeliverySchema);
