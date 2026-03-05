import { configureStore } from "@reduxjs/toolkit";
import {
  FLUSH,
  PAUSE,
  PERSIST,
  persistReducer,
  persistStore,
  PURGE,
  REGISTER,
  REHYDRATE,
} from "redux-persist";
import storage from "redux-persist/lib/storage";
import productsReducer from "./slices/productsSlice";
import cartReducer from "./slices/cartSlice";
import customizationReducer from "./slices/customizationSlice";
import userReducer from "./slices/userSlice";
import marketplaceSyncReducer from "./slices/marketplaceSyncSlice";
import { MARKETPLACE_PERSIST_VERSION, persistMigrate } from "./persistence";
import { marketplaceRealtimeFlags } from "../config/marketplaceRealtimeFlags";

const rootReducer = {
  products: productsReducer,
  cart: cartReducer,
  customization: customizationReducer,
  user: userReducer,
  marketplaceSync: marketplaceSyncReducer,
};

const persistConfig = {
  key: "root",
  version: MARKETPLACE_PERSIST_VERSION,
  storage,
  whitelist: ["products", "marketplaceSync"],
  migrate: persistMigrate,
};

const reducer = marketplaceRealtimeFlags.reduxPersistEnabled
  ? persistReducer(persistConfig, (state, action) => {
      if (action.type === REHYDRATE) {
        const inboundProductsSyncAt = action.payload?.marketplaceSync?.syncMeta?.lastProductsSyncAt;
        const currentProductsSyncAt = state?.marketplaceSync?.syncMeta?.lastProductsSyncAt;

        if (
          inboundProductsSyncAt
          && currentProductsSyncAt
          && new Date(inboundProductsSyncAt).getTime() < new Date(currentProductsSyncAt).getTime()
        ) {
          return {
            ...(state || {}),
            ...action.payload,
            products: state.products,
            marketplaceSync: state.marketplaceSync,
          };
        }
      }

      return Object.keys(rootReducer).reduce((nextState, key) => {
        nextState[key] = rootReducer[key](state?.[key], action);
        return nextState;
      }, {});
    })
  : rootReducer;

export const store = configureStore({
  reducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = marketplaceRealtimeFlags.reduxPersistEnabled ? persistStore(store) : null;
