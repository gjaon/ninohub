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

const parseTimestamp = (value) => {
  if (!value) {
    return null;
  }

  const asDate = new Date(value).getTime();
  if (Number.isFinite(asDate) && asDate > 0) {
    return asDate;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber > 10_000_000_000 ? asNumber : asNumber * 1000;
  }

  return null;
};

const toPositiveSeconds = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const normalizeTokenPayload = (payload = {}) => {
  const root = payload && typeof payload === "object" ? payload : {};
  const nestedData = root.data && typeof root.data === "object" ? root.data : {};

  const accessToken =
    root.accessToken
    || root.access_token
    || nestedData.accessToken
    || nestedData.access_token
    || null;

  const accessTokenExpiresIn =
    toPositiveSeconds(root.accessTokenExpiresIn)
    || toPositiveSeconds(root.expiresInSeconds)
    || toPositiveSeconds(root.expires_in)
    || toPositiveSeconds(nestedData.accessTokenExpiresIn)
    || toPositiveSeconds(nestedData.expiresInSeconds)
    || toPositiveSeconds(nestedData.expires_in)
    || null;

  const refreshToken =
    root.refreshToken
    || root.refresh_token
    || nestedData.refreshToken
    || nestedData.refresh_token
    || null;

  const refreshTokenExpiresAt =
    parseTimestamp(root.refreshTokenExpiresAt)
    || parseTimestamp(root.refresh_token_expires_at)
    || parseTimestamp(nestedData.refreshTokenExpiresAt)
    || parseTimestamp(nestedData.refresh_token_expires_at)
    || null;

  return {
    accessToken,
    accessTokenExpiresIn,
    refreshToken,
    refreshTokenExpiresAt,
  };
};

const setSessionState = ({ accessToken, accessTokenExpiresIn, refreshToken, refreshTokenExpiresAt }) => {
  const now = toUnixMs();
  const resolvedAccessTokenExpiresIn = toPositiveSeconds(accessTokenExpiresIn);
  const resolvedRefreshTokenExpiresAt = parseTimestamp(refreshTokenExpiresAt);

  sessionState = {
    ...sessionState,
    accessToken: accessToken || sessionState.accessToken,
    accessTokenExpiresAt:
      accessToken && resolvedAccessTokenExpiresIn
        ? now + resolvedAccessTokenExpiresIn * 1000
        : sessionState.accessTokenExpiresAt,
    refreshToken: refreshToken || sessionState.refreshToken,
    refreshTokenExpiresAt: resolvedRefreshTokenExpiresAt || sessionState.refreshTokenExpiresAt,
  };
};

const hasUsableRefreshToken = () => {
  if (!sessionState.refreshToken) {
    return false;
  }

  if (!sessionState.refreshTokenExpiresAt) {
    return true;
  }

  const { integrationAuthClockSkewMs } = getMarketplaceConfig();
  const now = toUnixMs();
  return now + Number(integrationAuthClockSkewMs || 0) < sessionState.refreshTokenExpiresAt;
};

const canIssueTokenFromKeyPair = () => {
  const { integrationKeyId, integrationKeySecret } = getMarketplaceConfig();
  return Boolean(integrationKeyId && integrationKeySecret);
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

  const normalizedPayload = normalizeTokenPayload(response.data || {});
  if (!normalizedPayload.accessToken) {
    throw new Error("Marketplace token response did not include access token");
  }

  setSessionState(normalizedPayload);

  return sessionState.accessToken;
};

const refreshAccessToken = async () => {
  const {
    integrationAuthRefreshFullPath,
    integrationSeedRefreshToken,
  } = getMarketplaceConfig();

  const seededRefreshToken = integrationSeedRefreshToken || null;
  if (!sessionState.refreshToken && seededRefreshToken) {
    sessionState.refreshToken = seededRefreshToken;
  }

  if (!hasUsableRefreshToken()) {
    if (canIssueTokenFromKeyPair()) {
      return issueAccessToken();
    }

    throw new Error("Marketplace refresh token is unavailable or expired, and key-pair issuance is not configured");
  }

  const refreshToken = sessionState.refreshToken;
  if (!refreshToken) {
    return issueAccessToken();
  }

  const client = getHttpClient();

  try {
    const response = await client.post(integrationAuthRefreshFullPath, {
      refreshToken,
    });

    const normalizedPayload = normalizeTokenPayload(response.data || {});
    if (!normalizedPayload.accessToken) {
      throw new Error("Marketplace refresh response did not include access token");
    }

    setSessionState(normalizedPayload);

    return sessionState.accessToken;
  } catch (error) {
    if (canIssueTokenFromKeyPair()) {
      return issueAccessToken();
    }
    throw error;
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
