const mongoose = require("mongoose");

const businessEventSchema = mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
    },
    correlationId: {
      type: String,
      default: null,
      index: true,
    },
    payloadVersion: {
      type: String,
      default: "1.0",
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

businessEventSchema.index({ buyerId: 1, occurredAt: -1 });

module.exports = mongoose.model("BusinessEvent", businessEventSchema);
