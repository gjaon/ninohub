const axios = require("axios");
const crypto = require("crypto");
const { randomUUID } = require("crypto");
const { getMarketplaceConfig } = require("../../config/marketplaceConfig");

const toUnixMs = () => Date.now();
const sha256Hex = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const normalizeBaseUrl = (baseUrl) => String(baseUrl || "").replace(/\/+$/g, "");

const buildSignaturePayload = ({ method, path, timestamp, nonce, body }) => {
  const serializedBody = JSON.stringify(body || {});
  const bodyHash = sha256Hex(serializedBody);
  return `${String(method || "GET").toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
};

let sessionState = {
  accessToken: null,
  accessTokenExpiresAt: 0,
  refreshToken: null,
  refreshTokenExpiresAt: null,
};

let refreshInFlight = null;

const setSessionState = ({ accessToken, accessTokenExpiresIn, refreshToken, refreshTokenExpiresAt }) => {
  const now = toUnixMs();

  sessionState = {
    ...sessionState,
    accessToken: accessToken || sessionState.accessToken,
    accessTokenExpiresAt: accessToken ? now + Number(accessTokenExpiresIn || 0) * 1000 : sessionState.accessTokenExpiresAt,
    refreshToken: refreshToken || sessionState.refreshToken,
    refreshTokenExpiresAt: refreshTokenExpiresAt ? new Date(refreshTokenExpiresAt).getTime() : sessionState.refreshTokenExpiresAt,
  };
};

const getHttpClient = () => {
  const { integrationBaseUrl } = getMarketplaceConfig();
  if (!integrationBaseUrl) {
    throw new Error("MARKETPLACE_INTEGRATION_BASE_URL is required for marketplace integration auth");
  }

  return axios.create({
    baseURL: normalizeBaseUrl(integrationBaseUrl),
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

const issueAccessToken = async () => {
  const {
    integrationKeyId,
    integrationKeySecret,
    integrationAuthTokenFullPath,
  } = getMarketplaceConfig();

  if (!integrationKeyId || !integrationKeySecret) {
    throw new Error(
      "MARKETPLACE_INTEGRATION_KEY_ID and MARKETPLACE_INTEGRATION_KEY_SECRET are required for signed token issuance"
    );
  }

  const body = {};
  const timestamp = String(toUnixMs());
  const nonce = randomUUID();
  const signaturePayload = buildSignaturePayload({
    method: "POST",
    path: integrationAuthTokenFullPath,
    timestamp,
    nonce,
    body,
  });
  const signature = crypto
    .createHmac("sha256", integrationKeySecret)
    .update(signaturePayload)
    .digest("hex");

  const client = getHttpClient();
  const response = await client.post(integrationAuthTokenFullPath, body, {
    headers: {
      "x-api-key": integrationKeyId,
      "x-api-secret": integrationKeySecret,
      "x-partner-timestamp": timestamp,
      "x-partner-nonce": nonce,
      "x-partner-signature": signature,
    },
  });

  const payload = response.data || {};
  setSessionState({
    accessToken: payload.accessToken,
    accessTokenExpiresIn: payload.accessTokenExpiresIn || payload.expiresInSeconds,
    refreshToken: payload.refreshToken,
    refreshTokenExpiresAt: payload.refreshTokenExpiresAt,
  });

  return sessionState.accessToken;
};

const refreshAccessToken = async () => {
  const {
    integrationAuthRefreshFullPath,
    integrationSeedRefreshToken,
  } = getMarketplaceConfig();

  const refreshToken = sessionState.refreshToken || integrationSeedRefreshToken;
  if (!refreshToken) {
    return issueAccessToken();
  }

  const client = getHttpClient();

  try {
    const response = await client.post(integrationAuthRefreshFullPath, {
      refreshToken,
    });

    const payload = response.data || {};
    setSessionState({
      accessToken: payload.accessToken,
      accessTokenExpiresIn: payload.accessTokenExpiresIn || payload.expiresInSeconds,
      refreshToken: payload.refreshToken,
      refreshTokenExpiresAt: payload.refreshTokenExpiresAt,
    });

    return sessionState.accessToken;
  } catch (error) {
    return issueAccessToken();
  }
};

const hasUsableAccessToken = () => {
  const { integrationAuthClockSkewMs } = getMarketplaceConfig();
  const now = toUnixMs();
  return Boolean(sessionState.accessToken) && now + Number(integrationAuthClockSkewMs || 0) < sessionState.accessTokenExpiresAt;
};

const withRefreshLock = async (work) => {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      return await work();
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

const getProviderAccessToken = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh && hasUsableAccessToken()) {
    return sessionState.accessToken;
  }

  return withRefreshLock(async () => {
    if (!forceRefresh && hasUsableAccessToken()) {
      return sessionState.accessToken;
    }

    return refreshAccessToken();
  });
};

const invalidateProviderAccessToken = () => {
  sessionState.accessToken = null;
  sessionState.accessTokenExpiresAt = 0;
};

module.exports = {
  getProviderAccessToken,
  invalidateProviderAccessToken,
};
