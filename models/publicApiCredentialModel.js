const mongoose = require("mongoose");

const publicApiCredentialSchema = mongoose.Schema(
  {
    partnerName: {
      type: String,
      required: true,
      trim: true,
    },
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    secretCiphertext: {
      type: String,
      required: true,
    },
    allowedOrigins: {
      type: [String],
      default: [],
    },
    scopes: {
      type: [String],
      default: ["inventory.read", "hold.write", "order.write"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("PublicApiCredential", publicApiCredentialSchema);
