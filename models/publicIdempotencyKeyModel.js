const mongoose = require("mongoose");

const publicIdempotencyKeySchema = mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      index: true,
    },
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    buyerActionKey: {
      type: String,
      required: true,
      index: true,
    },
    requestFingerprint: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["processing", "succeeded", "failed"],
      default: "processing",
    },
    responsePayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    errorPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

publicIdempotencyKeySchema.index({ key: 1, clientId: 1 }, { unique: true });
publicIdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PublicIdempotencyKey", publicIdempotencyKeySchema);
