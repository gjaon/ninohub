const { hashValue } = require("./cryptoService");
const PublicRequestNonce = require("../../models/publicRequestNonceModel");

const NONCE_TTL_SECONDS = 300;

const claimNonce = async ({ nonce, clientId, requestFingerprint }) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_SECONDS * 1000);
  const requestHash = hashValue(requestFingerprint);

  const existing = await PublicRequestNonce.findOne({ nonce, clientId });
  if (existing) {
    if (existing.consumedAt) {
      throw new Error("Nonce replay detected");
    }
    if (existing.expiresAt < now) {
      throw new Error("Nonce expired");
    }
    throw new Error("Nonce already used");
  }

  await PublicRequestNonce.create({
    nonce,
    clientId,
    expiresAt,
    requestHash,
    consumedAt: now,
  });

  return {
    nonce,
    consumedAt: now,
  };
};

module.exports = {
  claimNonce,
};
