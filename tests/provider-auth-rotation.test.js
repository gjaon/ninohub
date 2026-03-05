const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");

const providerAuthClientPath = "../services/marketplace/providerAuthClient";

const trackedEnvKeys = [
  "MARKETPLACE_INTEGRATION_BASE_URL",
  "MARKETPLACE_INTEGRATION_BASE_PATH",
  "MARKETPLACE_INTEGRATION_AUTH_TOKEN_PATH",
  "MARKETPLACE_INTEGRATION_AUTH_REFRESH_PATH",
  "MARKETPLACE_INTEGRATION_KEY_ID",
  "MARKETPLACE_INTEGRATION_KEY_SECRET",
  "MARKETPLACE_INTEGRATION_REFRESH_TOKEN",
  "MARKETPLACE_INTEGRATION_AUTH_CLOCK_SKEW_MS",
];

const withFreshProviderAuthClient = () => {
  delete require.cache[require.resolve(providerAuthClientPath)];
  return require(providerAuthClientPath);
};

const setIntegrationEnv = (overrides = {}) => {
  process.env.MARKETPLACE_INTEGRATION_BASE_URL = "https://sellsquare.example";
  process.env.MARKETPLACE_INTEGRATION_BASE_PATH = "/api/public/v1/marketplace";
  process.env.MARKETPLACE_INTEGRATION_AUTH_TOKEN_PATH = "/auth/token";
  process.env.MARKETPLACE_INTEGRATION_AUTH_REFRESH_PATH = "/auth/token/refresh";
  process.env.MARKETPLACE_INTEGRATION_AUTH_CLOCK_SKEW_MS = "1000";

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  });
};

let originalAxiosCreate;
let originalEnv = {};

test.beforeEach(() => {
  originalAxiosCreate = axios.create;
  originalEnv = Object.fromEntries(
    trackedEnvKeys.map((key) => [key, process.env[key]])
  );
});

test.afterEach(() => {
  axios.create = originalAxiosCreate;

  trackedEnvKeys.forEach((key) => {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  delete require.cache[require.resolve(providerAuthClientPath)];
});

test("accepts snake_case token fields and reuses cached access token", async () => {
  setIntegrationEnv({
    MARKETPLACE_INTEGRATION_KEY_ID: "mkp_key",
    MARKETPLACE_INTEGRATION_KEY_SECRET: "mkp_secret",
    MARKETPLACE_INTEGRATION_REFRESH_TOKEN: undefined,
  });

  let postCalls = 0;
  axios.create = () => ({
    post: async () => {
      postCalls += 1;
      return {
        data: {
          access_token: "snake-token-1",
          expires_in: 900,
          refresh_token: "snake-refresh-1",
          refresh_token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      };
    },
  });

  const { getProviderAccessToken } = withFreshProviderAuthClient();

  const firstToken = await getProviderAccessToken();
  const secondToken = await getProviderAccessToken();

  assert.equal(firstToken, "snake-token-1");
  assert.equal(secondToken, "snake-token-1");
  assert.equal(postCalls, 1);
});

test("falls back to key-pair token issuance when refresh call fails", async () => {
  setIntegrationEnv({
    MARKETPLACE_INTEGRATION_KEY_ID: "mkp_key",
    MARKETPLACE_INTEGRATION_KEY_SECRET: "mkp_secret",
    MARKETPLACE_INTEGRATION_REFRESH_TOKEN: "seed-refresh-token",
  });

  axios.create = () => ({
    post: async (path) => {
      if (path.endsWith("/auth/token/refresh")) {
        throw new Error("refresh endpoint failed");
      }

      return {
        data: {
          accessToken: "issued-token-1",
          accessTokenExpiresIn: 900,
          refreshToken: "issued-refresh-1",
          refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      };
    },
  });

  const { getProviderAccessToken } = withFreshProviderAuthClient();
  const token = await getProviderAccessToken();

  assert.equal(token, "issued-token-1");
});

test("throws clear error when refresh token is expired and key-pair issuance is unavailable", async () => {
  setIntegrationEnv({
    MARKETPLACE_INTEGRATION_KEY_ID: undefined,
    MARKETPLACE_INTEGRATION_KEY_SECRET: undefined,
    MARKETPLACE_INTEGRATION_REFRESH_TOKEN: "seed-refresh-token",
  });

  let refreshCalls = 0;
  axios.create = () => ({
    post: async (path) => {
      assert.ok(path.endsWith("/auth/token/refresh"));
      refreshCalls += 1;
      return {
        data: {
          accessToken: "refresh-token-1",
          accessTokenExpiresIn: 900,
          refreshToken: "refresh-token-rotated",
          refreshTokenExpiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        },
      };
    },
  });

  const { getProviderAccessToken, invalidateProviderAccessToken } = withFreshProviderAuthClient();

  const initialToken = await getProviderAccessToken();
  assert.equal(initialToken, "refresh-token-1");

  invalidateProviderAccessToken();

  await assert.rejects(
    () => getProviderAccessToken({ forceRefresh: true }),
    /refresh token is unavailable or expired/i
  );
  assert.equal(refreshCalls, 1);
});
