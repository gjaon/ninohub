const mongoose = require("mongoose");

const campaignDeliveryLogSchema = mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      index: true,
    },
    recipientKey: {
      type: String,
      required: true,
      index: true,
    },
    recipientType: {
      type: String,
      enum: ["user", "waitlist"],
      default: "user",
    },
    recipientSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    channel: {
      type: String,
      enum: ["email", "sms"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["sent", "failed", "skipped"],
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: null,
    },
    providerMessageId: {
      type: String,
      default: null,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    error: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

campaignDeliveryLogSchema.index({ campaignId: 1, channel: 1, recipientKey: 1 });
campaignDeliveryLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("CampaignDeliveryLog", campaignDeliveryLogSchema);
