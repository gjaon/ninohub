const { getMarketplaceConfig } = require("../config/marketplaceConfig");

const requireOriginAllowlist = (req, res, next) => {
  const origin = req.get("origin");
  const { originAllowlist } = getMarketplaceConfig();

  if (!origin) {
    return next();
  }

  if (!originAllowlist.includes(origin)) {
    return res.status(403).json({
      message: "Origin is not allowlisted",
    });
  }

  return next();
};

module.exports = {
  requireOriginAllowlist,
};
