const axios = require("axios");
const { getMarketplaceConfig } = require("../../config/marketplaceConfig");
const { withRetries } = require("./retry");
const {
  getProviderAccessToken,
  invalidateProviderAccessToken,
} = require("./providerAuthClient");
const { recordMetric } = require("./metricsService");

let inventoryFailureCircuit = {
  consecutiveFailures: 0,
  cooldownUntil: 0,
  lastFailureAt: 0,
  lastFailureReason: null,
};

const joinUrl = (base, path) => `${String(base || "").replace(/\/+$/g, "")}${String(path || "").startsWith("/") ? path : `/${path}`}`;

const mapProviderError = (error) => {
  if (error?.status && error?.code && error?.message && (error?.details || error?.details === null)) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      nonRetryable: Boolean(error.nonRetryable),
    };
  }

  if (!error?.response) {
    return {
      status: 503,
      code: "PROVIDER_NETWORK_FAILURE",
      message: error?.message || "Provider request failed",
      details: {
        name: error?.name || null,
        code: error?.code || null,
      },
      nonRetryable: false,
    };
  }

  const status = error.response?.status || 500;
  const message =
    error.response?.data?.message ||
    error.response?.data?.error ||
    error.message ||
    "Provider request failed";

  const code = status >= 500 ? "PROVIDER_TEMPORARY_FAILURE" : "PROVIDER_REQUEST_REJECTED";

  return {
    status,
    code,
    message,
    details: error.response?.data || null,
    nonRetryable: status === 404,
  };
};

const resolveAuthHeader = async ({ forceRefresh = false } = {}) => {
  const {
    providerBearerToken,
    integrationKeyId,
    integrationKeySecret,
    integrationSeedRefreshToken,
  } = getMarketplaceConfig();

  if (integrationKeyId && integrationKeySecret) {
    const accessToken = await getProviderAccessToken({ forceRefresh });
    return accessToken ? `Bearer ${accessToken}` : null;
  }

  if (!integrationKeySecret && integrationKeyId) {
    throw new Error(
      "MARKETPLACE_INTEGRATION_KEY_SECRET (or MARKETPLACE_PROVIDER_API_SECRET) is required when key ID is configured"
    );
  }

  if (integrationSeedRefreshToken) {
    const accessToken = await getProviderAccessToken({ forceRefresh });
    return accessToken ? `Bearer ${accessToken}` : null;
  }

  return providerBearerToken ? `Bearer ${providerBearerToken}` : null;
};

const getClient = async ({ forceRefresh = false } = {}) => {
  const {
    integrationBaseUrl,
    integrationBasePath,
    providerRequestTimeoutMs,
  } = getMarketplaceConfig();

  if (!integrationBaseUrl) {
    throw new Error("MARKETPLACE_INTEGRATION_BASE_URL is required when marketplace is enabled");
  }

  const authorizationHeader = await resolveAuthHeader({ forceRefresh });

  return axios.create({
    baseURL: joinUrl(integrationBaseUrl, integrationBasePath),
    timeout: providerRequestTimeoutMs,
    headers: {
      Authorization: authorizationHeader || undefined,
      "Content-Type": "application/json",
    },
  });
};

const recordProviderMetricSafe = async (key, labels = {}, increment = 1) => {
  try {
    await recordMetric(key, labels, increment);
  } catch (_error) {
  }
};

const requestWithRetry = async (requestFn, options = {}) => {
  const {
    providerRequestRetries,
    providerRetryBaseDelayMs,
    providerMaxTotalRequestTimeMs,
  } = getMarketplaceConfig();

  const retries = Math.max(1, Number(options.retries ?? providerRequestRetries));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs ?? providerRetryBaseDelayMs));
  const maxTotalMs = Math.max(1, Number(options.maxTotalMs ?? providerMaxTotalRequestTimeMs));
  const requestLabel = String(options.requestLabel || "provider-request");
  const startedAt = Date.now();

  return withRetries(async () => {
    const elapsedBeforeAttemptMs = Date.now() - startedAt;
    if (elapsedBeforeAttemptMs >= maxTotalMs) {
      const timedOutError = {
        status: 504,
        code: "PROVIDER_RETRY_BUDGET_EXHAUSTED",
        message: "Provider request exceeded total retry budget",
        details: {
          requestLabel,
          elapsedMs: elapsedBeforeAttemptMs,
          maxTotalMs,
        },
        nonRetryable: true,
      };
      throw timedOutError;
    }

    const attemptStartedAt = Date.now();
    try {
      const client = await getClient();
      const response = await requestFn(client);
      const attemptDurationMs = Math.max(0, Date.now() - attemptStartedAt);
      recordProviderMetricSafe("marketplace.provider.request.attempt", {
        request: requestLabel,
        outcome: "success",
      });
      console.info("[marketplace:provider:request] attempt", {
        request: requestLabel,
        outcome: "success",
        durationMs: attemptDurationMs,
      });
      return response;
    } catch (error) {
      const attemptDurationMs = Math.max(0, Date.now() - attemptStartedAt);
      if (error?.status && error?.code) {
        recordProviderMetricSafe("marketplace.provider.request.attempt", {
          request: requestLabel,
          outcome: "failed",
          code: String(error.code || "unknown"),
        });
        console.warn("[marketplace:provider:request] attempt", {
          request: requestLabel,
          outcome: "failed",
          code: error?.code,
          status: error?.status,
          durationMs: attemptDurationMs,
          message: error?.message,
        });
        throw error;
      }

      if (error.response?.status === 401) {
        invalidateProviderAccessToken();
        const retryClient = await getClient({ forceRefresh: true });
        const response = await requestFn(retryClient);
        recordProviderMetricSafe("marketplace.provider.request.attempt", {
          request: requestLabel,
          outcome: "success-after-refresh",
        });
        console.info("[marketplace:provider:request] attempt", {
          request: requestLabel,
          outcome: "success-after-refresh",
          durationMs: Math.max(0, Date.now() - attemptStartedAt),
        });
        return response;
      }

      const mapped = mapProviderError(error);
      recordProviderMetricSafe("marketplace.provider.request.attempt", {
        request: requestLabel,
        outcome: "failed",
        code: String(mapped?.code || "unknown"),
      });
      console.warn("[marketplace:provider:request] attempt", {
        request: requestLabel,
        outcome: "failed",
        code: mapped?.code,
        status: mapped?.status,
        durationMs: attemptDurationMs,
        message: mapped?.message,
      });
      throw mapped;
    }
  }, { retries, baseDelayMs });
};

const normalizeInventoryPayload = (payload) => {
  const candidates = [
    payload,
    payload?.listings,
    payload?.data,
    payload?.items,
    payload?.products,
    payload?.listings,
    payload?.results,
    payload?.rows,
    payload?.data?.items,
    payload?.data?.products,
    payload?.data?.listings,
    payload?.data?.results,
    payload?.result?.items,
    payload?.result?.products,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
};

const fetchInventory = async () => {
  const {
    providerInventoryPaths,
    integrationListingsPath,
    providerFallbackProbeEnabled,
    providerInventoryFailureThreshold,
    providerInventoryFailureCooldownMs,
  } = getMarketplaceConfig();

  const now = Date.now();
  if (
    inventoryFailureCircuit.consecutiveFailures >= providerInventoryFailureThreshold
    && now < inventoryFailureCircuit.cooldownUntil
  ) {
    const blockedMs = Math.max(0, inventoryFailureCircuit.cooldownUntil - now);
    recordProviderMetricSafe("marketplace.provider.inventory.circuit_blocked", {
      reason: String(inventoryFailureCircuit.lastFailureReason || "unknown"),
    });
    throw {
      status: 503,
      code: "PROVIDER_INVENTORY_CIRCUIT_OPEN",
      message: "Provider inventory fetch temporarily paused after repeated failures",
      details: {
        retryAfterMs: blockedMs,
        consecutiveFailures: inventoryFailureCircuit.consecutiveFailures,
        cooldownUntil: inventoryFailureCircuit.cooldownUntil,
      },
      nonRetryable: true,
    };
  }

  const candidatePaths = providerFallbackProbeEnabled
    ? [integrationListingsPath, ...providerInventoryPaths].filter(Boolean)
    : [integrationListingsPath].filter(Boolean);
  const uniquePaths = [...new Set(candidatePaths)];
  const attemptedPaths = [];
  let lastError = null;

  for (const endpointPath of uniquePaths) {
    const attemptStartedAt = Date.now();
    attemptedPaths.push(endpointPath);
    recordProviderMetricSafe("marketplace.provider.inventory.fallback_attempt", {
      endpointPath,
      fallbackMode: providerFallbackProbeEnabled ? "enabled" : "disabled",
    });

    try {
      const response = await requestWithRetry(
        (client) => client.get(endpointPath),
        { requestLabel: `inventory:${endpointPath}` }
      );
      const payload = response.data;

      console.info("[marketplace:provider:inventory-path-attempt]", {
        endpointPath,
        durationMs: Math.max(0, Date.now() - attemptStartedAt),
        outcome: "success",
      });

      console.info("[marketplace:provider:raw-products]", {
        endpointPath,
        payload,
      });

      const normalized = normalizeInventoryPayload(payload);
      if (normalized) {
        inventoryFailureCircuit = {
          consecutiveFailures: 0,
          cooldownUntil: 0,
          lastFailureAt: 0,
          lastFailureReason: null,
        };
        return normalized;
      }

      lastError = {
        status: 502,
        code: "PROVIDER_INVENTORY_SHAPE_INVALID",
        message: "Provider inventory response must contain an array payload",
        details: {
          endpointPath,
          payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
        },
        nonRetryable: true,
      };
      continue;
    } catch (error) {
      console.warn("[marketplace:provider:inventory-path-attempt]", {
        endpointPath,
        durationMs: Math.max(0, Date.now() - attemptStartedAt),
        outcome: "failed",
        status: error?.status,
        code: error?.code,
        message: error?.message,
      });
      lastError = error;
      if (error.status === 404) {
        continue;
      }
      const nextFailures = inventoryFailureCircuit.consecutiveFailures + 1;
      const shouldCooldown = nextFailures >= providerInventoryFailureThreshold;
      inventoryFailureCircuit = {
        consecutiveFailures: nextFailures,
        cooldownUntil: shouldCooldown ? Date.now() + providerInventoryFailureCooldownMs : 0,
        lastFailureAt: Date.now(),
        lastFailureReason: error?.code || error?.message || "unknown",
      };
      throw error;
    }
  }

  const nextFailures = inventoryFailureCircuit.consecutiveFailures + 1;
  const shouldCooldown = nextFailures >= providerInventoryFailureThreshold;
  inventoryFailureCircuit = {
    consecutiveFailures: nextFailures,
    cooldownUntil: shouldCooldown ? Date.now() + providerInventoryFailureCooldownMs : 0,
    lastFailureAt: Date.now(),
    lastFailureReason: lastError?.code || lastError?.message || "not-found",
  };

  throw {
    ...(lastError || {}),
    status: lastError?.status || 404,
    code: "PROVIDER_REQUEST_REJECTED",
    message:
      "Provider inventory endpoint not found. Set MARKETPLACE_PROVIDER_INVENTORY_PATHS to your provider product endpoint.",
    details: {
      attemptedPaths,
      lastError: lastError?.details || lastError || null,
    },
    nonRetryable: true,
  };
};

const fetchProviderListingById = async ({ listingId }) => {
  const normalizedListingId = String(listingId || "").trim();
  if (!normalizedListingId) {
    return null;
  }

  const { providerInventoryPaths, integrationListingsPath, providerFallbackProbeEnabled } = getMarketplaceConfig();
  const candidatePaths = providerFallbackProbeEnabled
    ? [integrationListingsPath, ...providerInventoryPaths].filter(Boolean)
    : [integrationListingsPath].filter(Boolean);
  const uniquePaths = [...new Set(candidatePaths)];

  let lastError = null;
  for (const endpointPath of uniquePaths) {
    try {
      const response = await requestWithRetry(
        (client) => client.get(`${endpointPath}/${encodeURIComponent(normalizedListingId)}`),
        { requestLabel: `listing:${endpointPath}` }
      );
      const payload = response?.data || {};
      const listing = normalizeOrderEnvelope(payload) || payload;
      return listing?.listing ? listing.listing : listing;
    } catch (error) {
      if (error?.status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError?.status === 404) {
    return null;
  }

  return null;
};

const normalizeOrderEnvelope = (payload) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (payload.order && typeof payload.order === "object") {
    return payload.order;
  }

  if (payload.data && typeof payload.data === "object") {
    if (payload.data.order && typeof payload.data.order === "object") {
      return payload.data.order;
    }
    return payload.data;
  }

  return payload;
};

const normalizeProviderOrderLines = (lines = []) =>
  Array.isArray(lines)
    ? lines.map((line, index) => {
        const listingId = String(line.listingId || "").trim();
        const variantId = String(line.variantId || "").trim();
        const hasGroupedIdentity = Boolean(listingId && variantId);

        return {
          lineId: String(line.lineId || `line_${index + 1}`),
          productId: hasGroupedIdentity ? "" : String(line.productId || line.id || line.listingId || "").trim(),
          listingId,
          variantId,
          quantity: Number(line.quantity || 0),
        };
      })
      .filter(
        (line) =>
          Number.isFinite(line.quantity)
          && line.quantity > 0
          && (line.productId || (line.listingId && line.variantId))
      )
    : [];

const normalizeText = (value) => {
  const normalized = String(value || "").trim();
  return normalized || "";
};

const pickFirstText = (...values) => {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
};

const normalizeFulfillmentMethod = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "pickup" || normalized === "delivery") {
    return normalized;
  }
  return "";
};

const buildFulfillmentPayload = (shippingAddress = {}) => {
  const method = normalizeFulfillmentMethod(shippingAddress?.fulfillmentMethod);
  const pickupLocation = pickFirstText(
    shippingAddress?.pickupLocation,
    shippingAddress?.pickupAddress,
    shippingAddress?.pickupPoint
  );
  const deliveryNotes = pickFirstText(
    shippingAddress?.deliveryNotes,
    shippingAddress?.notes,
    shippingAddress?.instruction,
    shippingAddress?.instructions
  );

  if (!method && !pickupLocation && !deliveryNotes) {
    return null;
  }

  const fulfillment = {
    method: method || undefined,
  };

  if (pickupLocation) {
    fulfillment.pickupLocation = pickupLocation;
  }

  if (deliveryNotes) {
    fulfillment.deliveryNotes = deliveryNotes;
  }

  return fulfillment;
};

const buildLineMetadataRows = (lineMetadata = []) =>
  (Array.isArray(lineMetadata) ? lineMetadata : []).map((row, index) => ({
    index,
    lineId: normalizeText(row?.lineId),
    productId: normalizeText(row?.productId),
    listingId: normalizeText(row?.listingId || row?.parentGroupId),
    variantId: normalizeText(row?.variantId),
    image: normalizeText(row?.image),
    selectedImage: normalizeText(row?.selectedImage || row?.image),
    variantName: normalizeText(row?.variantName),
    groupName: normalizeText(row?.groupName),
  }));

const findMatchingLineMetadata = ({ metadataRows = [], line = {}, index = 0 }) => {
  const lineId = normalizeText(line?.lineId);
  const listingId = normalizeText(line?.listingId);
  const variantId = normalizeText(line?.variantId);
  const productId = normalizeText(line?.productId);

  return metadataRows.find((candidate) => {
    if (lineId && candidate.lineId === lineId) {
      return true;
    }

    if (listingId && variantId && candidate.listingId === listingId && candidate.variantId === variantId) {
      return true;
    }

    if (productId && candidate.productId === productId) {
      return true;
    }

    return false;
  }) || metadataRows[index] || null;
};

const enrichProviderOrderLinesWithContext = ({ normalizedLines = [], lineMetadata = [] }) => {
  if (!Array.isArray(normalizedLines) || !normalizedLines.length || !Array.isArray(lineMetadata) || !lineMetadata.length) {
    return normalizedLines;
  }

  const metadataRows = buildLineMetadataRows(lineMetadata);

  return normalizedLines.map((line, index) => {
    const matched = findMatchingLineMetadata({
      metadataRows,
      line,
      index,
    });

    if (!matched) {
      return line;
    }

    const image = matched.image || matched.selectedImage;
    const selectedImage = matched.selectedImage || matched.image;

    return {
      ...line,
      image: image || undefined,
      selectedImage: selectedImage || undefined,
      variantImage: selectedImage || image || undefined,
      groupImage: image || undefined,
      variantName: matched.variantName || undefined,
      groupName: matched.groupName || undefined,
    };
  });
};

const buildLineMetadataPayload = ({ normalizedLines = [], lineMetadata = [] }) => {
  if (!Array.isArray(normalizedLines) || !normalizedLines.length || !Array.isArray(lineMetadata) || !lineMetadata.length) {
    return [];
  }

  const metadataRows = buildLineMetadataRows(lineMetadata);

  return normalizedLines
    .map((line, index) => {
      const lineId = normalizeText(line?.lineId);
      const listingId = normalizeText(line?.listingId);
      const variantId = normalizeText(line?.variantId);
      const productId = normalizeText(line?.productId);

      const matched = findMatchingLineMetadata({
        metadataRows,
        line,
        index,
      });

      if (!matched) {
        return null;
      }

      const hasContext = Boolean(
        matched.image
        || matched.selectedImage
        || matched.variantName
        || matched.groupName
      );

      if (!hasContext) {
        return null;
      }

      return {
        lineId: lineId || undefined,
        productId: productId || undefined,
        listingId: listingId || undefined,
        variantId: variantId || undefined,
        image: matched.image || undefined,
        selectedImage: matched.selectedImage || undefined,
        variantName: matched.variantName || undefined,
        groupName: matched.groupName || undefined,
      };
    })
    .filter(Boolean);
};

const buildCreateProviderOrderPayload = ({
  partnerOrderRef,
  buyerId,
  buyerEmail,
  buyerName,
  buyerPhone,
  lines,
  shippingAddress,
  lineMetadata,
}) => {
  const normalizedLines = normalizeProviderOrderLines(lines);
  let enrichedLines = normalizedLines;

  try {
    enrichedLines = enrichProviderOrderLinesWithContext({
      normalizedLines,
      lineMetadata,
    });
  } catch (_error) {
    enrichedLines = normalizedLines;
  }

  const customerName = pickFirstText(
    buyerName,
    shippingAddress?.fullName,
    shippingAddress?.name,
    `${pickFirstText(shippingAddress?.firstName)} ${pickFirstText(shippingAddress?.lastName)}`.trim()
  );

  const customerPhone = pickFirstText(
    buyerPhone,
    shippingAddress?.phone,
    shippingAddress?.phoneNumber
  );

  const customerEmail = pickFirstText(
    buyerEmail,
    shippingAddress?.email
  );

  const payload = {
    partnerOrderRef: partnerOrderRef || undefined,
    lines: enrichedLines,
    customer: {
      name: customerName || undefined,
      phone: customerPhone || undefined,
      email: customerEmail || undefined,
      address: [
        shippingAddress?.street,
        shippingAddress?.city,
        shippingAddress?.state,
        shippingAddress?.zipCode,
        shippingAddress?.country,
      ]
        .filter(Boolean)
        .join(", "),
    },
    buyerMeta: {
      buyerId,
    },
  };

  const hasShippingAddress = shippingAddress && typeof shippingAddress === "object" && Object.keys(shippingAddress).length > 0;
  if (hasShippingAddress) {
    payload.shippingAddress = shippingAddress;
  }

  const fulfillment = buildFulfillmentPayload(shippingAddress);
  if (fulfillment) {
    payload.fulfillment = fulfillment;
  }

  try {
    const lineMeta = buildLineMetadataPayload({
      normalizedLines,
      lineMetadata,
    });
    if (lineMeta.length) {
      payload.lineMeta = lineMeta;
    }
  } catch (_error) {
  }

  return payload;
};

const createProviderOrder = async ({
  partnerOrderRef,
  buyerId,
  buyerEmail,
  buyerName,
  buyerPhone,
  correlationId,
  idempotencyKey,
  lines,
  shippingAddress,
  lineMetadata,
}) => {
  const { integrationOrdersPath } = getMarketplaceConfig();
  let payload = buildCreateProviderOrderPayload({
    partnerOrderRef,
    buyerId,
    buyerEmail,
    buyerName,
    buyerPhone,
    lines,
    shippingAddress,
    lineMetadata,
  });

  payload.buyerMeta = {
    ...(payload.buyerMeta || {}),
    correlationId,
  };

  try {
    console.info("[marketplace:provider:create-order] payload-metadata", {
      correlationId,
      hasShippingAddress: Boolean(payload.shippingAddress),
      fulfillmentMethod: payload.fulfillment?.method || null,
      hasPickupLocation: Boolean(payload.fulfillment?.pickupLocation),
      hasDeliveryNotes: Boolean(payload.fulfillment?.deliveryNotes),
      lineCount: Array.isArray(payload.lines) ? payload.lines.length : 0,
      linesWithImageCount: Array.isArray(payload.lines)
        ? payload.lines.filter((line) => Boolean(line?.selectedImage || line?.image || line?.variantImage || line?.groupImage)).length
        : 0,
      lineMetaCount: Array.isArray(payload.lineMeta) ? payload.lineMeta.length : 0,
    });
  } catch (_error) {
  }

  const response = await requestWithRetry((client) =>
    client.post(integrationOrdersPath, payload, {
      headers: {
        "Idempotency-Key": idempotencyKey || undefined,
        "x-correlation-id": correlationId || undefined,
      },
    })
  );
  return normalizeOrderEnvelope(response.data);
};

const confirmProviderOrderPayment = async ({
  providerOrderId,
  paymentReference,
  correlationId,
}) => {
  const { integrationOrdersPath } = getMarketplaceConfig();
  const response = await requestWithRetry((client) =>
    client.post(
      `${integrationOrdersPath}/${providerOrderId}/payment-confirm`,
      {
        paymentId: paymentReference,
        trustedPaidFlag: true,
        partnerPaymentMeta: {
          source: "nino.paystack.verify",
          correlationId,
        },
      },
      {
        headers: {
          "x-correlation-id": correlationId || undefined,
        },
      }
    )
  );

  return normalizeOrderEnvelope(response.data);
};

const fetchProviderOrder = async ({ providerOrderId }) => {
  const { integrationOrdersPath } = getMarketplaceConfig();
  const response = await requestWithRetry((client) => client.get(`${integrationOrdersPath}/${providerOrderId}`));
  return normalizeOrderEnvelope(response.data);
};

const listProviderOrders = async ({ status } = {}) => {
  const { integrationOrdersPath } = getMarketplaceConfig();
  const response = await requestWithRetry((client) =>
    client.get(integrationOrdersPath, {
      params: {
        status: status || undefined,
      },
    })
  );

  const payload = response.data || {};
  return Array.isArray(payload.orders)
    ? payload.orders
    : Array.isArray(payload.data?.orders)
      ? payload.data.orders
      : [];
};

const upsertProviderWebhookEndpoint = async ({
  url,
  secret,
  eventTypes = [],
  endpointId,
}) => {
  const { integrationWebhookEndpointsPath } = getMarketplaceConfig();
  const payload = {
    url,
    secret,
    eventTypes,
    active: true,
  };

  const path = endpointId
    ? `${integrationWebhookEndpointsPath}/${endpointId}`
    : integrationWebhookEndpointsPath;

  const response = await requestWithRetry((client) =>
    endpointId
      ? client.put(path, payload)
      : client.post(path, payload)
  );

  const data = response?.data || {};
  return data.endpoint || data.data || data;
};

module.exports = {
  fetchInventory,
  fetchProviderListingById,
  createProviderOrder,
  confirmProviderOrderPayment,
  fetchProviderOrder,
  listProviderOrders,
  upsertProviderWebhookEndpoint,
  mapProviderError,
  __testables: {
    normalizeProviderOrderLines,
    buildFulfillmentPayload,
    enrichProviderOrderLinesWithContext,
    buildLineMetadataPayload,
    buildCreateProviderOrderPayload,
    getInventoryFailureCircuit: () => ({ ...inventoryFailureCircuit }),
  },
};
