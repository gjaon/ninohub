const mongoose = require("mongoose");

const marketplaceProductCacheSchema = mongoose.Schema(
  {
    providerProductId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sku: {
      type: String,
      default: null,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      default: "Uncategorized",
    },
    image: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      required: true,
    },
    priceBase: {
      type: Number,
      default: 0,
    },
    priceEffective: {
      type: Number,
      default: 0,
    },
    discountPercent: {
      type: Number,
      default: 0,
    },
    discountMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    variantSnapshots: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    currency: {
      type: String,
      default: "NGN",
    },
    availableQuantity: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    providerUpdatedAt: {
      type: Date,
      default: null,
      index: true,
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

module.exports = mongoose.model("MarketplaceProductCache", marketplaceProductCacheSchema);
