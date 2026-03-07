const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseBooleanFlag = (value) => String(value).toLowerCase() === "true";
const parseOptionalBoolean = (value) => {
  if (value === undefined || value === null || value === "") return null;
  return parseBooleanFlag(value);
};

const parseList = (value) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const trimLeadingAndTrailingSlashes = (value = "") => value.replace(/^\/+|\/+$/g, "");

const trimSlashes = (value = "") => value.replace(/\/+$/g, "");
const ensureLeadingSlash = (value = "") => (value.startsWith("/") ? value : `/${value}`);
const joinPath = (...parts) =>
  `/${parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .join("/")}`;

const normalizeIntegrationPath = ({ basePath, candidatePath, fallbackPath }) => {
  const normalizedBasePath = ensureLeadingSlash(trimSlashes(basePath || ""));
  const normalizedFallbackPath = ensureLeadingSlash(trimSlashes(fallbackPath || ""));
  const normalizedCandidatePath = ensureLeadingSlash(trimSlashes(candidatePath || normalizedFallbackPath));
  const basePrefix = `${trimSlashes(normalizedBasePath)}/`;

  if (normalizedCandidatePath === normalizedBasePath) {
    return "/";
  }

  if (normalizedCandidatePath.startsWith(basePrefix)) {
    return `/${trimLeadingAndTrailingSlashes(normalizedCandidatePath.slice(basePrefix.length))}`;
  }

  return normalizedCandidatePath;
};

const getMarketplaceConfig = () => {
  const isProduction = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
  const defaultSafeRollout = !isProduction;
  const publicApiEnabled = parseOptionalBoolean(process.env.MARKETPLACE_PUBLIC_API_ENABLED) ?? false;
  const webhooksEnabled = parseOptionalBoolean(process.env.MARKETPLACE_WEBHOOKS_ENABLED) ?? false;
  const internalUiEnabled = parseOptionalBoolean(process.env.MARKETPLACE_INTERNAL_UI_ENABLED) ?? false;
  const adaptivePollingEnabled =
    parseOptionalBoolean(process.env.MARKETPLACE_ADAPTIVE_POLLING_ENABLED) ?? defaultSafeRollout;
  const realtimeEventDedupeEnabled =
    parseOptionalBoolean(process.env.MARKETPLACE_REALTIME_EVENT_DEDUPE_ENABLED) ?? defaultSafeRollout;
  const adminModuleEnabled = parseOptionalBoolean(process.env.MARKETPLACE_ADMIN_MODULE_ENABLED) ?? true;
  const checkoutFallbackEnabled = parseOptionalBoolean(process.env.MARKETPLACE_CHECKOUT_FALLBACK_ENABLED) ?? true;
  const adminMessagingEnabled = parseOptionalBoolean(process.env.MARKETPLACE_ADMIN_MESSAGING_ENABLED) ?? true;
  const instantProductsRenderEnabled = true;
  const paystackMode = (process.env.PAYSTACK_MODE || "test").trim().toLowerCase();

  assert(["test", "live"].includes(paystackMode), "PAYSTACK_MODE must be either 'test' or 'live'");

  const paystackKey = (process.env.PAYSTACK_SECRET_KEY || "").trim();
  if (paystackKey) {
    if (paystackMode === "test") {
      assert(
        paystackKey.startsWith("sk_test_"),
        "PAYSTACK_SECRET_KEY must start with sk_test_ when PAYSTACK_MODE=test"
      );
    }

    if (paystackMode === "live") {
      assert(
        paystackKey.startsWith("sk_live_"),
        "PAYSTACK_SECRET_KEY must start with sk_live_ when PAYSTACK_MODE=live"
      );
    }
  }

  if (publicApiEnabled || webhooksEnabled || internalUiEnabled) {
    assert(
      process.env.PUBLIC_PARTNER_JWT_SECRET,
      "PUBLIC_PARTNER_JWT_SECRET is required when marketplace features are enabled"
    );
    assert(
      process.env.MARKETPLACE_SECRET_ENCRYPTION_KEY,
      "MARKETPLACE_SECRET_ENCRYPTION_KEY is required when marketplace features are enabled"
    );
  }

  const defaultOrigins = [
    "http://localhost:3000",
    "http://localhost:3005",
    "http://localhost:5173",
    "https://www.ninohub.com",
  ];

  const frontendOrigins = parseList(process.env.MARKETPLACE_FRONTEND_ORIGINS);
  const partnerOrigins = parseList(process.env.MARKETPLACE_PARTNER_ALLOWED_ORIGINS);
  const configuredInventoryPaths = parseList(process.env.MARKETPLACE_PROVIDER_INVENTORY_PATHS);
  const integrationBaseUrl =
    (process.env.MARKETPLACE_INTEGRATION_BASE_URL || "http://localhost:4000").trim();
  const integrationBasePath = ensureLeadingSlash(
    trimSlashes(process.env.MARKETPLACE_INTEGRATION_BASE_PATH || "/api/public/v1/marketplace")
  );
  const integrationListingsPath = normalizeIntegrationPath({
    basePath: integrationBasePath,
    candidatePath: process.env.MARKETPLACE_INTEGRATION_LISTINGS_PATH,
    fallbackPath: "/listings",
  });
  const integrationHoldsPath = normalizeIntegrationPath({
    basePath: integrationBasePath,
    candidatePath: process.env.MARKETPLACE_INTEGRATION_HOLDS_PATH,
    fallbackPath: "/holds",
  });
  const integrationOrdersPath = normalizeIntegrationPath({
    basePath: integrationBasePath,
    candidatePath: process.env.MARKETPLACE_INTEGRATION_ORDERS_PATH,
    fallbackPath: "/orders",
  });
  const integrationWebhookEndpointsPath = normalizeIntegrationPath({
    basePath: integrationBasePath,
    candidatePath: process.env.MARKETPLACE_INTEGRATION_WEBHOOK_ENDPOINTS_PATH,
    fallbackPath: "/webhooks/endpoints",
  });
  const integrationAuthTokenPath = normalizeIntegrationPath({
    basePath: integrationBasePath,
    candidatePath: process.env.MARKETPLACE_INTEGRATION_AUTH_TOKEN_PATH,
    fallbackPath: "/auth/token",
  });
  const integrationAuthRefreshPath = normalizeIntegrationPath({
    basePath: integrationBasePath,
    candidatePath: process.env.MARKETPLACE_INTEGRATION_AUTH_REFRESH_PATH,
    fallbackPath: "/auth/token/refresh",
  });
  const integrationKeyId =
    (
      process.env.MARKETPLACE_INTEGRATION_KEY_ID ||
      ""
    ).trim();
  const integrationKeySecret =
    (
      process.env.MARKETPLACE_INTEGRATION_KEY_SECRET ||
      ""
    ).trim();
  const integrationSeedRefreshToken = (process.env.MARKETPLACE_INTEGRATION_REFRESH_TOKEN || "").trim();
  const providerBearerToken =
    (process.env.MARKETPLACE_PROVIDER_BEARER_TOKEN || "").trim();

  const providerInventoryPaths = configuredInventoryPaths.length
    ? configuredInventoryPaths
    : [
        integrationListingsPath,
        "/api/inventory", 
        "/inventory",
        "/products",
        "/api/products",
        "/listings",
      ];
  const providerFallbackProbeEnabled =
    parseOptionalBoolean(process.env.MARKETPLACE_PROVIDER_FALLBACK_PROBE_ENABLED)
    ?? !isProduction;

  const originAllowlist = [...new Set([...defaultOrigins, ...frontendOrigins, ...partnerOrigins])];

  return {
    publicApiEnabled,
    webhooksEnabled,
    internalUiEnabled,
    paystackMode,
    originAllowlist,
    partnerOrigins,
    integrationBaseUrl,
    integrationBasePath,
    integrationListingsPath,
    integrationHoldsPath,
    integrationOrdersPath,
    integrationWebhookEndpointsPath,
    providerBearerToken,
    providerInventoryPaths: [...new Set(providerInventoryPaths.map((path) => path.trim()).filter(Boolean))],
    providerFallbackProbeEnabled,
    providerRequestRetries: Number(process.env.MARKETPLACE_PROVIDER_REQUEST_RETRIES || 2),
    providerRetryBaseDelayMs: Number(process.env.MARKETPLACE_PROVIDER_RETRY_BASE_DELAY_MS || 250),
    providerMaxTotalRequestTimeMs: Number(process.env.MARKETPLACE_PROVIDER_MAX_TOTAL_REQUEST_TIME_MS || 12000),
    providerRequestTimeoutMs: Number(process.env.MARKETPLACE_PROVIDER_REQUEST_TIMEOUT_MS || 5000),
    providerInventoryFailureThreshold: Number(process.env.MARKETPLACE_PROVIDER_INVENTORY_FAILURE_THRESHOLD || 3),
    providerInventoryFailureCooldownMs: Number(process.env.MARKETPLACE_PROVIDER_INVENTORY_FAILURE_COOLDOWN_MS || 45000),
    integrationAuthTokenPath,
    integrationAuthRefreshPath,
    integrationAuthTokenFullPath: joinPath(integrationBasePath, integrationAuthTokenPath),
    integrationAuthRefreshFullPath: joinPath(integrationBasePath, integrationAuthRefreshPath),
    integrationKeyId,
    integrationKeySecret,
    integrationSeedRefreshToken,
    integrationAuthClockSkewMs: Number(process.env.MARKETPLACE_INTEGRATION_AUTH_CLOCK_SKEW_MS || 120000),
    webhookRetryMaxAttempts: Number(process.env.MARKETPLACE_WEBHOOK_RETRY_MAX_ATTEMPTS || 6),
    webhookRetryBaseDelayMs: Number(process.env.MARKETPLACE_WEBHOOK_RETRY_BASE_DELAY_MS || 15000),
    providerWebhookPublicBaseUrl: (process.env.MARKETPLACE_WEBHOOK_PUBLIC_BASE_URL || "").trim(),
    providerWebhookInboundPath: (process.env.MARKETPLACE_WEBHOOK_INBOUND_PATH || "/api/webhooks/marketplace").trim(),
    providerWebhookRegistrationEnabled: parseBooleanFlag(process.env.MARKETPLACE_PROVIDER_WEBHOOK_REGISTRATION_ENABLED),
    providerWebhookSecretRotateDays: Number(process.env.MARKETPLACE_PROVIDER_WEBHOOK_SECRET_ROTATE_DAYS || 30),
    adminModuleEnabled,
    checkoutFallbackEnabled,
    adminMessagingEnabled,
    instantProductsRenderEnabled,
    adaptivePollingEnabled,
    realtimeEventDedupeEnabled,
    adaptivePollingHealthyIntervalMs: Number(process.env.MARKETPLACE_ADAPTIVE_POLLING_HEALTHY_INTERVAL_MS || 300000),
    adaptivePollingDegradedIntervalMs: Number(process.env.MARKETPLACE_ADAPTIVE_POLLING_DEGRADED_INTERVAL_MS || 60000),
    adaptivePollingUnhealthyIntervalMs: Number(process.env.MARKETPLACE_ADAPTIVE_POLLING_UNHEALTHY_INTERVAL_MS || 15000),
    adaptivePollingDegradedLagMsThreshold: Number(process.env.MARKETPLACE_ADAPTIVE_POLLING_DEGRADED_LAG_MS || 60000),
    adaptivePollingUnhealthyLagMsThreshold: Number(process.env.MARKETPLACE_ADAPTIVE_POLLING_UNHEALTHY_LAG_MS || 180000),
  };
};

const shouldUseProviderProducts = () => {
  const config = getMarketplaceConfig();
  const hasTokenBasedIntegration = Boolean(
    config.integrationBaseUrl &&
      ((config.integrationKeyId && config.integrationKeySecret) || config.integrationSeedRefreshToken)
  );
  const hasApiKeyIntegration = Boolean(config.integrationBaseUrl && config.providerBearerToken);
  const hasProviderIntegration = hasApiKeyIntegration || hasTokenBasedIntegration;
  return config.internalUiEnabled || hasProviderIntegration;
};

module.exports = {
  getMarketplaceConfig,
  shouldUseProviderProducts,
};

