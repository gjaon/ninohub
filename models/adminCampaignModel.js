const mongoose = require("mongoose");

const adminCampaignSchema = mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    channels: {
      type: [String],
      enum: ["email", "sms"],
      default: [],
    },
    audience: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    template: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
      index: true,
    },
    totals: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        recipients: 0,
        sent: 0,
        failed: 0,
      },
    },
    actorEmail: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

adminCampaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdminCampaign", adminCampaignSchema);
