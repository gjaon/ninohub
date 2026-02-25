const mongoose = require("mongoose");

const cartSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sessionId: {
      type: String,
      default: null,
    },
    items: [
      {
        productId: {
          type: String,
          required: true,
        },
        productName: String,
        price: Number,
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        image: String,
      },
    ],
    customizations: [
      {
        customizationId: String,
        productId: String,
        name: String,
        details: mongoose.Schema.Types.Mixed,
        price: Number,
        quantity: {
          type: Number,
          default: 1,
        },
      },
    ],
    totalItems: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      default: 0,
    },
    // Cart reservation fields
    reservationExpiry: {
      type: Date,
      default: null,
    },
    reservationStatus: {
      type: String,
      enum: ["active", "expired", "checkout", "completed"],
      default: "active",
    },
    checkoutStartedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
cartSchema.index({ userId: 1 });
cartSchema.index({ sessionId: 1 });

const Cart = mongoose.model("Cart", cartSchema);
module.exports = Cart;
