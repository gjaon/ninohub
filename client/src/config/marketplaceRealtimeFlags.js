const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return null;
};

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const realtimesync = true

const isProduction = process.env.NODE_ENV === "production";
const defaultEnabled = !isProduction;

const resolveFlag = (value, fallback = defaultEnabled) => {
  const parsed = parseBoolean(value);
  return parsed === null ? fallback : parsed;
};

export const marketplaceRealtimeFlags = {
  reduxPersistEnabled: true,
  realtimeSyncEnabled: realtimesync,
  instantProductsRenderEnabled: true,
  optimisticCartEnabled: resolveFlag(process.env.REACT_APP_OPTIMISTIC_CART_ENABLED, true),
  productsSyncCoalescingEnabled: resolveFlag(process.env.REACT_APP_PRODUCTS_SYNC_COALESCING_ENABLED, true),
  productsSyncDebounceMs: parseNumber(process.env.REACT_APP_PRODUCTS_SYNC_DEBOUNCE_MS, 350),
  productsSyncMinIntervalMs: parseNumber(process.env.REACT_APP_PRODUCTS_SYNC_MIN_INTERVAL_MS, 1000),
};

export default marketplaceRealtimeFlags;
