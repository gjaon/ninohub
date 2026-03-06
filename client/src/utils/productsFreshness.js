export const toMs = (value) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const shouldApplyIncomingSync = ({ incomingSyncMs, currentSyncMs }) => {
  if (!incomingSyncMs) {
    return true;
  }

  return incomingSyncMs >= currentSyncMs;
};

export const getPayloadSyncMs = (productsPayload = [], metadata = {}) => {
  const metadataSyncMs = toMs(metadata?.syncedAt || metadata?.lastSuccessfulSyncAt);
  const payloadSyncMs = Array.isArray(productsPayload)
    ? Math.max(
        0,
        ...productsPayload.map((item) => toMs(item?.syncedAt || item?.updatedAt || item?.providerUpdatedAt))
      )
    : 0;

  return Math.max(metadataSyncMs, payloadSyncMs);
};
