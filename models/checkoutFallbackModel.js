const mongoose = require("mongoose");

const checkoutFallbackSchema = mongoose.Schema(
  {
    fallbackId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    holdId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    paymentReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed", "retrying", "resolved", "resolved_manual", "resolved_retry", "failed"],
      default: "pending",
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    payment: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    holdSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    orderIntentSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    shippingAddress: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lineItems: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    correlationId: {
      type: String,
      default: null,
      index: true,
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true,
    },
    providerError: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    retryMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {
        count: 0,
        inFlight: false,
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
      },
    },
    adminNotes: {
      type: [
        {
          note: String,
          actorEmail: String,
          createdAt: Date,
        },
      ],
      default: [],
    },
    history: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    resolvedOrderId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

checkoutFallbackSchema.index({ createdAt: -1 });
checkoutFallbackSchema.index({ "buyer.email": 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("CheckoutFallback", checkoutFallbackSchema);
