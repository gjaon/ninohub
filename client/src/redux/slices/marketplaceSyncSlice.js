import { createSlice } from "@reduxjs/toolkit";

const MAX_SEEN_EVENT_IDS = 500;

const toMs = (value) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const shouldAcceptTimestamp = (incomingValue, currentValue) => toMs(incomingValue) >= toMs(currentValue);

const getOrderNumberFromPayload = (payload = {}) => {
  return String(
    payload?.orderNumber
      || payload?.providerOrderNumber
      || payload?.orderId
      || payload?.providerOrderId
      || payload?.reference
      || ""
  ).trim();
};

const upsertOrderFromEvent = (state, eventEnvelope) => {
  const payload = eventEnvelope?.payload || {};
  const orderNumber = getOrderNumberFromPayload(payload);
  if (!orderNumber) {
    return;
  }

  const existing = state.ordersByNumber[orderNumber] || {};
  const incomingTimestamp = eventEnvelope?.occurredAt || payload?.updatedAt || payload?.occurredAt || new Date().toISOString();
  const currentTimestamp = existing.updatedAt || existing.occurredAt || "";

  if (!shouldAcceptTimestamp(incomingTimestamp, currentTimestamp)) {
    return;
  }

  state.ordersByNumber[orderNumber] = {
    ...existing,
    orderNumber,
    status: payload?.status || existing.status || null,
    providerOrderId: payload?.providerOrderId || existing.providerOrderId || null,
    paymentReference: payload?.reference || payload?.paymentReference || existing.paymentReference || null,
    occurredAt: eventEnvelope?.occurredAt || existing.occurredAt || null,
    updatedAt: incomingTimestamp,
    source: eventEnvelope?.source || existing.source || null,
  };

  if (!state.orderNumbers.includes(orderNumber)) {
    state.orderNumbers.push(orderNumber);
  }
};

const initialState = {
  schemaVersion: 1,
  syncMeta: {
    lastEventAt: null,
    lastServerSyncAt: null,
    lastProductsSyncAt: null,
    lastSocketEventAt: null,
    fallbackPollingActive: false,
    fallbackPollingReason: null,
    pollIntervalMs: null,
  },
  ordersByNumber: {},
  orderNumbers: [],
  processedEventIds: {},
  processedEventOrder: [],
  observability: {
    totalEventsApplied: 0,
    duplicateEventsSuppressed: 0,
    lastEventLagMs: 0,
    maxEventLagMs: 0,
    rehydrationCount: 0,
    migrationCount: 0,
    lastRehydratedAt: null,
    lastMigrationVersion: null,
  },
};

const applyMarketplaceEvent = (state, eventEnvelope) => {
  const eventId = String(eventEnvelope?.eventId || "").trim();
  const occurredAt = eventEnvelope?.occurredAt || new Date().toISOString();

  if (eventId && state.processedEventIds[eventId]) {
    state.observability.duplicateEventsSuppressed += 1;
    return;
  }

  if (eventId) {
    state.processedEventIds[eventId] = occurredAt;
    state.processedEventOrder.push(eventId);

    while (state.processedEventOrder.length > MAX_SEEN_EVENT_IDS) {
      const evicted = state.processedEventOrder.shift();
      if (evicted) {
        delete state.processedEventIds[evicted];
      }
    }
  }

  if (shouldAcceptTimestamp(occurredAt, state.syncMeta.lastEventAt)) {
    state.syncMeta.lastEventAt = occurredAt;
  }

  state.syncMeta.lastSocketEventAt = new Date().toISOString();
  state.observability.totalEventsApplied += 1;

  const lagMs = Math.max(0, Date.now() - toMs(occurredAt));
  state.observability.lastEventLagMs = lagMs;
  state.observability.maxEventLagMs = Math.max(state.observability.maxEventLagMs, lagMs);

  const eventType = String(eventEnvelope?.eventType || "").toLowerCase();
  if (eventType.startsWith("marketplace.order.")) {
    upsertOrderFromEvent(state, eventEnvelope);
  }

  if (eventType === "marketplace.polling.mode.changed") {
    state.syncMeta.fallbackPollingActive = Boolean(eventEnvelope?.payload?.fallbackActive);
    state.syncMeta.fallbackPollingReason = eventEnvelope?.payload?.reason || null;
    state.syncMeta.pollIntervalMs = Number(eventEnvelope?.payload?.pollIntervalMs || 0) || null;
  }
};

const marketplaceSyncSlice = createSlice({
  name: "marketplaceSync",
  initialState,
  reducers: {
    ingestMarketplaceEvent: (state, action) => {
      applyMarketplaceEvent(state, action.payload || {});
    },
    ingestMarketplaceEventsBatch: (state, action) => {
      const events = Array.isArray(action.payload) ? action.payload : [];
      events.forEach((eventEnvelope) => applyMarketplaceEvent(state, eventEnvelope));
      state.syncMeta.lastServerSyncAt = new Date().toISOString();
    },
    replaceMarketplaceOrders: (state, action) => {
      const orders = Array.isArray(action.payload) ? action.payload : [];
      const nextOrders = {};
      const nextOrderNumbers = [];

      for (const order of orders) {
        const orderNumber = String(order?.orderNumber || "").trim();
        if (!orderNumber) {
          continue;
        }

        nextOrderNumbers.push(orderNumber);
        nextOrders[orderNumber] = {
          ...(state.ordersByNumber[orderNumber] || {}),
          ...order,
          orderNumber,
          updatedAt: order?.updatedAt || new Date().toISOString(),
        };
      }

      state.ordersByNumber = nextOrders;
      state.orderNumbers = nextOrderNumbers;
      state.syncMeta.lastServerSyncAt = new Date().toISOString();
    },
    setProductsSyncedAt: (state, action) => {
      const incoming = action.payload;
      if (shouldAcceptTimestamp(incoming, state.syncMeta.lastProductsSyncAt)) {
        state.syncMeta.lastProductsSyncAt = incoming;
      }
    },
    setFallbackPollingState: (state, action) => {
      const payload = action.payload || {};
      state.syncMeta.fallbackPollingActive = Boolean(payload.active);
      state.syncMeta.fallbackPollingReason = payload.reason || null;
      state.syncMeta.pollIntervalMs = Number(payload.pollIntervalMs || 0) || null;
    },
    noteRehydrated: (state) => {
      state.observability.rehydrationCount += 1;
      state.observability.lastRehydratedAt = new Date().toISOString();
    },
    noteMigrated: (state, action) => {
      state.observability.migrationCount += 1;
      state.observability.lastMigrationVersion = Number(action.payload || 0) || null;
    },
  },
});

export const {
  ingestMarketplaceEvent,
  ingestMarketplaceEventsBatch,
  replaceMarketplaceOrders,
  setProductsSyncedAt,
  setFallbackPollingState,
  noteRehydrated,
  noteMigrated,
} = marketplaceSyncSlice.actions;

export default marketplaceSyncSlice.reducer;
