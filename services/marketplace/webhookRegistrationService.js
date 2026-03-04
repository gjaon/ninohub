const crypto = require("crypto");
const { getMarketplaceConfig } = require("../../config/marketplaceConfig");
const MarketplaceWebhookEndpoint = require("../../models/marketplaceWebhookEndpointModel");
const { encrypt, decrypt } = require("./cryptoService");
const { upsertProviderWebhookEndpoint } = require("./providerClient");
const { recordMetric } = require("./metricsService");

const normalizeJoinUrl = (base, path) => {
  if (!base) return "";
  const sanitizedBase = String(base).replace(/\/+$/g, "");
  const sanitizedPath = String(path || "").startsWith("/")
    ? String(path)
    : `/${String(path || "")}`;
  return `${sanitizedBase}${sanitizedPath}`;
};

const generateWebhookSecret = () => crypto.randomBytes(32).toString("hex");

const DEFAULT_PROVIDER_WEBHOOK_EVENT_TYPES = [
  "marketplace.order.placed",
  "marketplace.order.payment_confirmed",
  "marketplace.order.accepted",
  "marketplace.order.rejected",
  "marketplace.order.processing",
  "marketplace.order.shipped",
  "marketplace.order.delivered",
  "marketplace.order.line.updated",
  "marketplace.listing.updated",
  "marketplace.webhook.delivery",
  "marketplace.webhook.delivery.succeeded",
  "marketplace.webhook.delivery.failed",
];

const shouldRotateSecret = ({ endpoint, rotateDays }) => {
  if (!endpoint?.updatedAt) return true;
  const thresholdMs = Math.max(1, Number(rotateDays || 30)) * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(endpoint.updatedAt).getTime() >= thresholdMs;
};

const ensureProviderWebhookEndpointRegistered = async () => {
  const config = getMarketplaceConfig();

  if (!config.webhooksEnabled || !config.providerWebhookRegistrationEnabled) {
    return { skipped: true, reason: "registration-disabled" };
  }

  const targetUrl = normalizeJoinUrl(
    config.providerWebhookPublicBaseUrl,
    config.providerWebhookInboundPath
  );

  if (!targetUrl) {
    await recordMetric("marketplace.webhook.registration.skipped", {
      reason: "missing-target-url",
    });
    return { skipped: true, reason: "missing-target-url" };
  }

  const environment = process.env.NODE_ENV || "development";
  let endpoint = await MarketplaceWebhookEndpoint.findOne({
    provider: "provider",
    environment,
  });

  const rotate = shouldRotateSecret({
    endpoint,
    rotateDays: config.providerWebhookSecretRotateDays,
  });

  let sharedSecret = "";
  if (!endpoint || rotate) {
    sharedSecret = generateWebhookSecret();
  } else {
    sharedSecret = decrypt(endpoint.secretCiphertext);
  }

  const providerEndpoint = await upsertProviderWebhookEndpoint({
    endpointId: endpoint?.providerEndpointId || null,
    url: targetUrl,
    secret: sharedSecret,
    eventTypes: DEFAULT_PROVIDER_WEBHOOK_EVENT_TYPES,
  });

  endpoint = await MarketplaceWebhookEndpoint.findOneAndUpdate(
    {
      provider: "provider",
      environment,
    },
    {
      $set: {
        endpointId: endpoint?.endpointId || `provider-${environment}`,
        provider: "provider",
        environment,
        url: targetUrl,
        providerEndpointId: providerEndpoint?.id || providerEndpoint?._id || endpoint?.providerEndpointId || null,
        secretCiphertext: encrypt(sharedSecret),
        isActive: true,
        registrationStatus: "active",
        lastRegisteredAt: new Date(),
        secretVersion: rotate ? Number(endpoint?.secretVersion || 1) + 1 : Number(endpoint?.secretVersion || 1),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
    }
  );

  process.env.MARKETPLACE_PROVIDER_WEBHOOK_SECRET = sharedSecret;

  await recordMetric("marketplace.webhook.registration.updated", {
    environment,
    rotated: rotate ? "yes" : "no",
  });

  return {
    skipped: false,
    endpointId: endpoint.endpointId,
    providerEndpointId: endpoint.providerEndpointId,
    rotated: rotate,
  };
};

module.exports = {
  ensureProviderWebhookEndpointRegistered,
};
