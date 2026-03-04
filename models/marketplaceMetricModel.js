const mongoose = require("mongoose");

const marketplaceMetricSchema = mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      index: true,
    },
    labels: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    day: {
      type: String,
      required: true,
      index: true,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

marketplaceMetricSchema.index({ key: 1, day: 1, "labels.hash": 1 }, { unique: true });

module.exports = mongoose.model("MarketplaceMetric", marketplaceMetricSchema);
