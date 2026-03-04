const mongoose = require("mongoose");

const publicRequestNonceSchema = mongoose.Schema(
  {
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    requestHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

publicRequestNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PublicRequestNonce", publicRequestNonceSchema);
