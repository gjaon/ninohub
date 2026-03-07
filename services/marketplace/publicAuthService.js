const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const PublicApiCredential = require("../../models/publicApiCredentialModel");
const PublicRefreshSession = require("../../models/publicRefreshSessionModel");
const { decrypt, hashValue } = require("./cryptoService");

const getPartnerJwtSecret = () => process.env.PUBLIC_PARTNER_JWT_SECRET;

const issuePartnerSession = async ({ clientId, clientSecret, origin }) => {
  const credential = await PublicApiCredential.findOne({ clientId, isActive: true });
  if (!credential) {
    throw new Error("Invalid client credentials");
  }

  if (credential.allowedOrigins.length && origin && !credential.allowedOrigins.includes(origin)) {
    throw new Error("Origin not allowed for credential");
  }

  const expectedSecret = decrypt(credential.secretCiphertext);
  if (expectedSecret !== clientSecret) {
    throw new Error("Invalid client credentials");
  }

  const sessionId = uuidv4();
  const refreshToken = uuidv4();
  const refreshTokenHash = hashValue(refreshToken);

  await PublicRefreshSession.create({
    sessionId,
    clientId,
    refreshTokenHash,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });

  const accessToken = jwt.sign(
    { clientId, scopes: credential.scopes, sessionId },
    getPartnerJwtSecret(),
    { expiresIn: "15m" }
  );

  return {
    tokenType: "Bearer",
    accessToken,
    refreshToken,
    expiresInSeconds: 900,
    sessionId,
    scopes: credential.scopes,
  };
};

const verifyPartnerToken = (token) => {
  return jwt.verify(token, getPartnerJwtSecret());
};

module.exports = {
  issuePartnerSession,
  verifyPartnerToken,
};
