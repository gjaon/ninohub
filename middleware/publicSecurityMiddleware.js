const { claimNonce } = require("../services/marketplace/nonceService");

const requireSignedNonce = async (req, res, next) => {
  try {
    const nonce = req.get("x-request-nonce");
    const clientId = req.partner?.clientId || req.body?.clientId;
    if (!nonce || !clientId) {
      return res.status(400).json({ message: "Missing nonce or client context" });
    }

    const fingerprint = `${req.method}:${req.originalUrl}:${JSON.stringify(req.body || {})}`;
    await claimNonce({
      nonce,
      clientId,
      requestFingerprint: fingerprint,
    });

    return next();
  } catch (error) {
    return res.status(409).json({ message: error.message || "Nonce validation failed" });
  }
};

module.exports = {
  requireSignedNonce,
};
