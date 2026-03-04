const { getMarketplaceConfig } = require("../config/marketplaceConfig");

const requireFlag = (flagName) => (req, res, next) => {
  const config = getMarketplaceConfig();
  const enabled = Boolean(config[flagName]);

  if (!enabled) {
    return res.status(404).json({
      message: "Not found",
    });
  }

  return next();
};

const requireAnyFlag = (flagNames = []) => (req, res, next) => {
  const config = getMarketplaceConfig();
  const hasEnabledFlag = (flagNames || []).some((flagName) => Boolean(config[flagName]));

  if (!hasEnabledFlag) {
    return res.status(404).json({
      message: "Not found",
    });
  }

  return next();
};

module.exports = {
  requireFlag,
  requireAnyFlag,
};
