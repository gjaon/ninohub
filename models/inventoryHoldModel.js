const mongoose = require("mongoose");

const inventoryHoldSchema = mongoose.Schema(
  {
    holdId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    providerHoldId: {
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
    status: {
      type: String,
      enum: ["active", "completed", "released", "expired"],
      default: "active",
      index: true,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    amount: {
      type: Number,
      required: true,
    },
    pricingBreakdown: {
      subtotal: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
    },
    coupon: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sessionId: {
      type: String,
      default: null,
      index: true,
    },
    items: [
      {
        productId: String,
        listingId: {
          type: String,
          default: null,
        },
        productName: String,
        variantId: {
          type: String,
          default: null,
        },
        variantName: {
          type: String,
          default: null,
        },
        parentGroupId: {
          type: String,
          default: null,
        },
        groupName: {
          type: String,
          default: null,
        },
        quantity: Number,
        unitPrice: Number,
        image: String,
        selectedImage: {
          type: String,
          default: null,
        },
      },
    ],
    shippingAddress: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    idempotencyKey: {
      type: String,
      required: true,
      index: true,
    },
    paymentReference: {
      type: String,
      default: null,
      index: true,
      unique: true,
      sparse: true,
    },
    paystackAccessCode: {
      type: String,
      default: null,
    },
    paymentStatus: {
      type: String,
      enum: ["initialized", "verified", "failed"],
      default: "initialized",
    },
    correlationId: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    auditTrail: [
      {
        action: String,
        occurredAt: Date,
        metadata: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  {
    timestamps: true,
  }
);

inventoryHoldSchema.index({ buyerId: 1, idempotencyKey: 1 }, { unique: true });
inventoryHoldSchema.index({ status: 1, expiresAt: 1, updatedAt: -1 });

module.exports = mongoose.model("InventoryHold", inventoryHoldSchema);
