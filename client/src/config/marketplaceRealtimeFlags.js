const parseBoolean = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return null;
};

const isProduction = process.env.NODE_ENV === "production";
const defaultEnabled = !isProduction;

const resolveFlag = (value, fallback = defaultEnabled) => {
  const parsed = parseBoolean(value);
  return parsed === null ? fallback : parsed;
};

export const marketplaceRealtimeFlags = {
  reduxPersistEnabled: resolveFlag(process.env.REACT_APP_MARKETPLACE_REDUX_PERSIST_ENABLED),
  realtimeSyncEnabled: resolveFlag(process.env.REACT_APP_MARKETPLACE_REALTIME_SYNC_ENABLED),
};

export default marketplaceRealtimeFlags;
