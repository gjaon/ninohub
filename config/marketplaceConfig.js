const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const parseBooleanFlag = (value) => String(value).toLowerCase() === "true";

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
  const publicApiEnabled = parseBooleanFlag(process.env.MARKETPLACE_PUBLIC_API_ENABLED);
  const webhooksEnabled = parseBooleanFlag(process.env.MARKETPLACE_WEBHOOKS_ENABLED);
  const internalUiEnabled = parseBooleanFlag(process.env.MARKETPLACE_INTERNAL_UI_ENABLED);
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
      process.env.PUBLIC_PARTNER_JWT_SECRET || process.env.JWT_SECRET,
      "PUBLIC_PARTNER_JWT_SECRET or JWT_SECRET is required when marketplace features are enabled"
    );
    assert(
      process.env.MARKETPLACE_SECRET_ENCRYPTION_KEY || process.env.JWT_SECRET,
      "MARKETPLACE_SECRET_ENCRYPTION_KEY or JWT_SECRET is required when marketplace features are enabled"
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
    (process.env.MARKETPLACE_INTEGRATION_BASE_URL || process.env.MARKETPLACE_PROVIDER_BASE_URL || "http://localhost:4000").trim();
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
      process.env.MARKETPLACE_PROVIDER_KEY_ID ||
      process.env.MARKETPLACE_PROVIDER_API_KEY ||
      ""
    ).trim();
  const integrationKeySecret =
    (
      process.env.MARKETPLACE_INTEGRATION_KEY_SECRET ||
      process.env.MARKETPLACE_PROVIDER_KEY_SECRET ||
      process.env.MARKETPLACE_PROVIDER_API_SECRET ||
      ""
    ).trim();
  const integrationSeedRefreshToken = (process.env.MARKETPLACE_INTEGRATION_REFRESH_TOKEN || "").trim();
  const providerBearerToken =
    (process.env.MARKETPLACE_PROVIDER_BEARER_TOKEN || "").trim();

  const providerInventoryPaths = configuredInventoryPaths.length
    ? configuredInventoryPaths
    : [
        process.env.MARKETPLACE_PROVIDER_INVENTORY_PATH || integrationListingsPath,
        "/api/inventory", 
        "/inventory",
        "/products",
        "/api/products",
        "/listings",
      ];

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
    providerBaseUrl: process.env.MARKETPLACE_PROVIDER_BASE_URL || "",
    providerApiKey: process.env.MARKETPLACE_PROVIDER_API_KEY || "",
    providerBearerToken,
    providerInventoryPaths: [...new Set(providerInventoryPaths.map((path) => path.trim()).filter(Boolean))],
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
  };
};

const shouldUseProviderProducts = () => {
  const config = getMarketplaceConfig();
  const hasTokenBasedIntegration = Boolean(
    config.integrationBaseUrl &&
      ((config.integrationKeyId && config.integrationKeySecret) || config.integrationSeedRefreshToken)
  );
  const hasApiKeyIntegration = Boolean(config.providerBaseUrl && config.providerBearerToken);
  const hasProviderIntegration = hasApiKeyIntegration || hasTokenBasedIntegration;
  return config.internalUiEnabled || hasProviderIntegration;
};

module.exports = {
  getMarketplaceConfig,
  shouldUseProviderProducts,
};

