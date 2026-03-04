const { verifyPartnerToken } = require("../services/marketplace/publicAuthService");

const requirePartnerAuth = (req, res, next) => {
  try {
    const authorization = req.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Partner token required" });
    }

    const token = authorization.slice(7);
    const decoded = verifyPartnerToken(token);
    req.partner = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid partner token" });
  }
};

module.exports = {
  requirePartnerAuth,
};
