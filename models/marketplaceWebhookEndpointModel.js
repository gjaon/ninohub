const mongoose = require("mongoose");

const marketplaceWebhookEndpointSchema = mongoose.Schema(
  {
    endpointId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["provider", "paystack"],
    },
    environment: {
      type: String,
      default: process.env.NODE_ENV || "development",
      index: true,
    },
    providerEndpointId: {
      type: String,
      default: null,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    secretCiphertext: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    secretVersion: {
      type: Number,
      default: 1,
    },
    lastRegisteredAt: {
      type: Date,
      default: null,
    },
    registrationStatus: {
      type: String,
      enum: ["pending", "active", "failed"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("MarketplaceWebhookEndpoint", marketplaceWebhookEndpointSchema);
