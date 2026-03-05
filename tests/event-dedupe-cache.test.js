const test = require("node:test");
const assert = require("node:assert/strict");

const { createEventDedupeCache } = require("../services/marketplace/eventDedupeCache");

test("dedupe cache identifies repeated events", () => {
  const cache = createEventDedupeCache({ maxSize: 3 });

  cache.add("evt-1");
  assert.equal(cache.has("evt-1"), true);
  assert.equal(cache.has("evt-2"), false);

  cache.add("evt-2");
  cache.add("evt-3");
  cache.add("evt-4");

  assert.equal(cache.has("evt-1"), false);
  assert.equal(cache.has("evt-4"), true);
});
