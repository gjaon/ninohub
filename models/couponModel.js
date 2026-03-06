const mongoose = require("mongoose");

const couponSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    discountType: {
      type: String,
      enum: ["amount", "percentage"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: "NGN",
    },
    status: {
      type: String,
      enum: ["active", "redeemed", "expired", "revoked"],
      default: "active",
      index: true,
    },
    assignedToType: {
      type: String,
      enum: ["waitlist", "user", "manual"],
      default: "manual",
      index: true,
    },
    assignedToRef: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    assignedEmail: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    assignedPhone: {
      type: String,
      default: null,
      trim: true,
    },
    createdByAdminEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    redemption: {
      redeemedAt: {
        type: Date,
        default: null,
      },
      redeemedByUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      paymentReference: {
        type: String,
        default: null,
      },
      orderId: {
        type: String,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.index({ assignedToType: 1, assignedToRef: 1, status: 1 });
couponSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Coupon", couponSchema);
