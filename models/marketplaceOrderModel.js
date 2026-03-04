const mongoose = require("mongoose");

const marketplaceOrderSchema = mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    providerOrderId: {
      type: String,
      default: null,
      index: true,
    },
    providerOrderNumber: {
      type: String,
      default: null,
      index: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    holdId: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    paymentReference: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    status: {
      type: String,
      enum: [
        "placed",
        "payment_confirmed",
        "accepted",
        "rejected",
        "processing",
        "shipped",
        "delivered",
        "failed",
        "cancelled",
      ],
      default: "payment_confirmed",
    },
    providerStatus: {
      type: String,
      default: "payment_confirmed",
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    idempotencyKey: {
      type: String,
      required: true,
      index: true,
    },
    correlationId: {
      type: String,
      required: true,
      index: true,
    },
    providerCorrelationId: {
      type: String,
      default: null,
      index: true,
    },
    snapshotVersion: {
      type: String,
      default: "1.0",
    },
    buyerSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    shippingAddress: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    auditTrail: [
      {
        action: String,
        occurredAt: Date,
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],
    lineSnapshot: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    lineDecisions: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    lastProviderSyncAt: {
      type: Date,
      default: null,
    },
    providerLastEventId: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

marketplaceOrderSchema.index({ buyerId: 1, createdAt: -1 });

module.exports = mongoose.model("MarketplaceOrder", marketplaceOrderSchema);
