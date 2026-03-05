const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateWebhookHealth,
  buildPollingProfile,
  HEALTHY,
  DEGRADED,
  UNHEALTHY,
} = require("../services/marketplace/adaptivePollingService");

test("evaluates webhook health as healthy with low lag and no retries", () => {
  const health = evaluateWebhookHealth({
    latestProcessedAgeMs: 5_000,
    retryingCount: 0,
    exhaustedCount: 0,
    avgLagMs: 2_000,
    degradedLagMsThreshold: 60_000,
    unhealthyLagMsThreshold: 180_000,
  });

  assert.equal(health, HEALTHY);
});

test("evaluates webhook health as degraded on retrying deliveries", () => {
  const health = evaluateWebhookHealth({
    latestProcessedAgeMs: 30_000,
    retryingCount: 2,
    exhaustedCount: 0,
    avgLagMs: 20_000,
    degradedLagMsThreshold: 60_000,
    unhealthyLagMsThreshold: 180_000,
  });

  assert.equal(health, DEGRADED);
});

test("evaluates webhook health as unhealthy on exhausted deliveries", () => {
  const health = evaluateWebhookHealth({
    latestProcessedAgeMs: 20_000,
    retryingCount: 0,
    exhaustedCount: 1,
    avgLagMs: 20_000,
    degradedLagMsThreshold: 60_000,
    unhealthyLagMsThreshold: 180_000,
  });

  assert.equal(health, UNHEALTHY);
});

test("builds fallback polling profile by health tier", () => {
  const healthyProfile = buildPollingProfile({
    health: HEALTHY,
    healthyIntervalMs: 300_000,
    degradedIntervalMs: 60_000,
    unhealthyIntervalMs: 15_000,
  });
  const degradedProfile = buildPollingProfile({
    health: DEGRADED,
    healthyIntervalMs: 300_000,
    degradedIntervalMs: 60_000,
    unhealthyIntervalMs: 15_000,
  });
  const unhealthyProfile = buildPollingProfile({
    health: UNHEALTHY,
    healthyIntervalMs: 300_000,
    degradedIntervalMs: 60_000,
    unhealthyIntervalMs: 15_000,
  });

  assert.equal(healthyProfile.fallbackActive, false);
  assert.equal(degradedProfile.pollIntervalMs, 60_000);
  assert.equal(unhealthyProfile.pollIntervalMs, 15_000);
});
