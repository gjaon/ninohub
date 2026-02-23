const mongoose = require("mongoose");

const orderSchema = mongoose.Schema(
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
    orderNumber: {
      type: String,
      unique: true,
      required: true,
    },
    items: [
      {
        productId: String,
        productName: String,
        price: Number,
        quantity: Number,
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
        quantity: Number,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["paystack"],
      required: true,
    },
    paymentReference: {
      type: String,
      default: null,
    },
    paystackAccessCode: {
      type: String,
      default: null,
    },
    paystackReference: {
      type: String,
      default: null,
    },
    shippingAddress: {
      fullName: String,
      email: String,
      phone: String,
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    trackingNumber: {
      type: String,
      default: null,
    },
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
orderSchema.index({ userId: 1 });
orderSchema.index({ sessionId: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ paystackReference: 1 });

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
