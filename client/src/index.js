import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { persistor, store } from "./redux/store";
import { marketplaceRealtimeFlags } from "./config/marketplaceRealtimeFlags";
import { noteRehydrated } from "./redux/slices/marketplaceSyncSlice";
import { Toaster } from "sonner";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      {marketplaceRealtimeFlags.reduxPersistEnabled && persistor ? (
        <PersistGate
          loading={null}
          persistor={persistor}
          onBeforeLift={() => {
            store.dispatch(noteRehydrated());
          }}
        >
          <App />
        </PersistGate>
      ) : (
        <App />
      )}
      <Toaster position="bottom-center" richColors />
    </Provider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals((metric) => {
  if (!metric) {
    return;
  }

  if (typeof window !== "undefined") {
    window.__NINO_PRODUCTS_METRICS__ = window.__NINO_PRODUCTS_METRICS__ || [];
    window.__NINO_PRODUCTS_METRICS__.push({
      name: `web-vitals:${metric.name}`,
      valueMs: Number(metric.value || 0),
      labels: {
        id: metric.id,
      },
      recordedAt: new Date().toISOString(),
    });
  }

  if (metric.name === "FCP") {
    console.info("[products:timing]", {
      name: "first-contentful-paint",
      valueMs: Number(metric.value || 0),
      id: metric.id,
    });
  }
});
