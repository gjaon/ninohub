const MAX_CACHE_SIZE = 1000;

const createEventDedupeCache = ({ maxSize = MAX_CACHE_SIZE } = {}) => {
  const seen = new Map();

  const has = (eventId) => seen.has(String(eventId || ""));

  const add = (eventId, timestamp = Date.now()) => {
    const key = String(eventId || "").trim();
    if (!key) {
      return;
    }

    seen.set(key, timestamp);

    while (seen.size > maxSize) {
      const oldestKey = seen.keys().next().value;
      seen.delete(oldestKey);
    }
  };

  return {
    has,
    add,
    size: () => seen.size,
  };
};

module.exports = {
  createEventDedupeCache,
};
