const HEALTHY = "healthy";
const DEGRADED = "degraded";
const UNHEALTHY = "unhealthy";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const evaluateWebhookHealth = ({
  latestProcessedAgeMs,
  retryingCount,
  exhaustedCount,
  avgLagMs,
  unhealthyLagMsThreshold,
  degradedLagMsThreshold,
}) => {
  const normalizedLag = toNumber(avgLagMs);
  const normalizedAge = toNumber(latestProcessedAgeMs);
  const normalizedRetrying = toNumber(retryingCount);
  const normalizedExhausted = toNumber(exhaustedCount);

  if (normalizedExhausted > 0 || normalizedLag >= unhealthyLagMsThreshold || normalizedAge >= unhealthyLagMsThreshold) {
    return UNHEALTHY;
  }

  if (normalizedRetrying > 0 || normalizedLag >= degradedLagMsThreshold || normalizedAge >= degradedLagMsThreshold) {
    return DEGRADED;
  }

  return HEALTHY;
};

const buildPollingProfile = ({
  health,
  healthyIntervalMs,
  degradedIntervalMs,
  unhealthyIntervalMs,
}) => {
  if (health === UNHEALTHY) {
    return {
      fallbackActive: true,
      pollIntervalMs: unhealthyIntervalMs,
      reason: "webhook_unhealthy",
    };
  }

  if (health === DEGRADED) {
    return {
      fallbackActive: true,
      pollIntervalMs: degradedIntervalMs,
      reason: "webhook_degraded",
    };
  }

  return {
    fallbackActive: false,
    pollIntervalMs: healthyIntervalMs,
    reason: "webhook_healthy",
  };
};

module.exports = {
  HEALTHY,
  DEGRADED,
  UNHEALTHY,
  evaluateWebhookHealth,
  buildPollingProfile,
};
