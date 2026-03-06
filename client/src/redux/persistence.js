import { createMigrate } from "redux-persist";

export const MARKETPLACE_PERSIST_VERSION = 1;

const normalizeProductsState = (state = {}) => {
  const items = Array.isArray(state.items) ? state.items : [];
  const selectedCategory = state.selectedCategory || "All";
  const searchTerm = state.searchTerm || "";

  return {
    ...state,
    items, 
    filteredItems: Array.isArray(state.filteredItems) ? state.filteredItems : items,
    selectedCategory,
    searchTerm,
    loading: false,
    refreshing: false,
    error: null,
    lastAppliedSyncAt: state.lastAppliedSyncAt || null,
  };
};

const normalizeMarketplaceSyncState = (state = {}) => ({
  schemaVersion: 1,
  syncMeta: {
    lastEventAt: state?.syncMeta?.lastEventAt || null,
    lastServerSyncAt: state?.syncMeta?.lastServerSyncAt || null,
    lastProductsSyncAt: state?.syncMeta?.lastProductsSyncAt || null,
    lastSocketEventAt: state?.syncMeta?.lastSocketEventAt || null,
    fallbackPollingActive: Boolean(state?.syncMeta?.fallbackPollingActive),
    fallbackPollingReason: state?.syncMeta?.fallbackPollingReason || null,
    pollIntervalMs: Number(state?.syncMeta?.pollIntervalMs || 0) || null,
  },
  ordersByNumber: state?.ordersByNumber && typeof state.ordersByNumber === "object" ? state.ordersByNumber : {},
  orderNumbers: Array.isArray(state?.orderNumbers) ? state.orderNumbers : [],
  processedEventIds: state?.processedEventIds && typeof state.processedEventIds === "object" ? state.processedEventIds : {},
  processedEventOrder: Array.isArray(state?.processedEventOrder) ? state.processedEventOrder : [],
  observability: {
    totalEventsApplied: Number(state?.observability?.totalEventsApplied || 0),
    duplicateEventsSuppressed: Number(state?.observability?.duplicateEventsSuppressed || 0),
    lastEventLagMs: Number(state?.observability?.lastEventLagMs || 0),
    maxEventLagMs: Number(state?.observability?.maxEventLagMs || 0),
    rehydrationCount: Number(state?.observability?.rehydrationCount || 0),
    migrationCount: Number(state?.observability?.migrationCount || 0) + 1,
    lastRehydratedAt: state?.observability?.lastRehydratedAt || null,
    lastMigrationVersion: MARKETPLACE_PERSIST_VERSION,
  },
});

export const migrations = {
  1: (state = {}) => {
    return {
      ...state,
      products: normalizeProductsState(state.products),
      marketplaceSync: normalizeMarketplaceSyncState(state.marketplaceSync),
    };
  },
};

export const persistMigrate = createMigrate(migrations, { debug: false });
