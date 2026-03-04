const crypto = require("crypto");
const MarketplaceMetric = require("../../models/marketplaceMetricModel");

const labelHash = (labels = {}) =>
  crypto.createHash("sha1").update(JSON.stringify(labels)).digest("hex");

const getDayKey = (date = new Date()) => date.toISOString().slice(0, 10);

const recordMetric = async (key, labels = {}, increment = 1) => {
  const hash = labelHash(labels);
  const day = getDayKey();

  await MarketplaceMetric.updateOne(
    { key, day, "labels.hash": hash },
    {
      $inc: { count: increment },
      $setOnInsert: {
        key,
        day,
        labels: {
          ...labels,
          hash,
        },
      },
    },
    { upsert: true }
  );
};

const getMetrics = async ({ keyPrefix } = {}) => {
  const query = keyPrefix ? { key: new RegExp(`^${keyPrefix}`) } : {};
  return MarketplaceMetric.find(query).sort({ day: -1, key: 1 }).lean();
};

module.exports = {
  recordMetric,
  getMetrics,
};
