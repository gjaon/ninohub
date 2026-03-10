import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { setProducts, setLoading, setRefreshing, setError } from "./redux/slices/productsSlice";
import { setUser } from "./redux/slices/userSlice";
import {
  updateCartFromSocket,
  rollbackOptimisticOperation,
  commitOptimisticOperation,
} from "./redux/slices/cartSlice";
import {
  ingestMarketplaceEvent,
  ingestMarketplaceEventsBatch,
  setProductsSyncedAt,
} from "./redux/slices/marketplaceSyncSlice";
import { getUser } from "./services/auth";
import { fetchProducts } from "./services/products";
import { initializeSocket } from "./services/socket";
import { syncMarketplaceEvents } from "./services/marketplace";
import { marketplaceRealtimeFlags } from "./config/marketplaceRealtimeFlags";
import { LaunchProvider } from "./context/LaunchContext";
import {
  toMs,
  shouldApplyIncomingSync,
  getPayloadSyncMs,
} from "./utils/productsFreshness";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Customization from "./pages/Customization";
import CreateCustomization from "./pages/CreateCustomization";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import TrackOrder from "./pages/TrackOrder";
import ContactUs from "./pages/ContactUs";
import Profile from "./pages/Profile";
import WaitlistForm from "./pages/WaitlistForm";
import AdminPanel from "./pages/AdminPanel";
import "./App.css";

const createCorrelationId = (prefix = "web") => {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${Date.now()}-${random}`;
};

const emitProductsTimingMetric = (name, valueMs, labels = {}) => {
  const payload = {
    name,
    valueMs: Math.max(0, Number(valueMs || 0)),
    labels,
    recordedAt: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    window.__NINO_PRODUCTS_METRICS__ = window.__NINO_PRODUCTS_METRICS__ || [];
    window.__NINO_PRODUCTS_METRICS__.push(payload);
  }

  console.info("[products:timing]", payload);
};

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}


function App() {
  const dispatch = useDispatch();
  const { currentUser } = useSelector((state) => state.user);
  const products = useSelector((state) => state.products.items);
  const lastAppliedSyncAt = useSelector((state) => state.products.lastAppliedSyncAt);
  const rehydrated = useSelector((state) => state?._persist?.rehydrated ?? true);
  const marketplaceLastEventAt = useSelector((state) => state.marketplaceSync?.syncMeta?.lastEventAt);
  const lastProductsSyncAt = useSelector((state) => state.marketplaceSync?.syncMeta?.lastProductsSyncAt);
  const hasSocketSyncedProductsRef = React.useRef(false);
  const lastSocketSyncAtRef = React.useRef(0);
  const lastKnownProductsSyncAtRef = React.useRef(0);
  const pendingProductsResyncRef = React.useRef(null);
  const productsCountRef = React.useRef(products.length);
  const rehydratedRef = React.useRef(rehydrated);
  const initialProductsFetchDoneRef = React.useRef(false);
  const appBootPerfRef = React.useRef(
    typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()
  );
  const firstProductsVisibleMetricSentRef = React.useRef(false);
  const productsSyncInFlightRef = React.useRef(false);
  const lastProductsSyncEmitAtRef = React.useRef(0);

  useEffect(() => {
    productsCountRef.current = products.length;
  }, [products.length]);

  useEffect(() => {
    rehydratedRef.current = rehydrated;
  }, [rehydrated]);

  useEffect(() => {
    lastKnownProductsSyncAtRef.current = Math.max(
      toMs(lastProductsSyncAt),
      toMs(lastAppliedSyncAt),
      lastSocketSyncAtRef.current
    );
  }, [lastAppliedSyncAt, lastProductsSyncAt]);

  useEffect(() => {
    if (!rehydrated || !products.length || firstProductsVisibleMetricSentRef.current) {
      return;
    }

    firstProductsVisibleMetricSentRef.current = true;
    const now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    emitProductsTimingMetric("time-to-products-visible", now - appBootPerfRef.current, {
      source: "rehydrated-products",
      productsCount: products.length,
    });
  }, [products.length, rehydrated]);

  useEffect(() => {
    let didCancel = false;

    if (!rehydrated) {
      return () => {
        didCancel = true;
      };
    }

    const loadProducts = async () => {
      const hasPersistedProducts = products.length > 0;
      if (hasPersistedProducts && marketplaceRealtimeFlags.instantProductsRenderEnabled) {
        dispatch(setRefreshing(true));
      } else {
        dispatch(setLoading(true));
      }

      try {
        const response = await fetchProducts();
        if (!didCancel) {
          const incomingSyncMs = getPayloadSyncMs(response);
          const currentSyncMs = Math.max(lastKnownProductsSyncAtRef.current, toMs(lastProductsSyncAt));

          if (hasSocketSyncedProductsRef.current && incomingSyncMs && incomingSyncMs < lastSocketSyncAtRef.current) {
            return;
          }

          if (!shouldApplyIncomingSync({ incomingSyncMs, currentSyncMs })) {
            return;
          }

          if (Array.isArray(response) && !response.length && products.length) {
            return;
          }

          dispatch(setProducts(response));
          if (incomingSyncMs > 0) {
            const syncedAt = new Date(incomingSyncMs).toISOString();
            dispatch(setProductsSyncedAt(syncedAt));
            lastKnownProductsSyncAtRef.current = incomingSyncMs;
          }
        }
      } catch (error) {
        if (!didCancel) {
          dispatch(setError(error.message));
        }
      } finally {
        if (!didCancel) {
          dispatch(setLoading(false));
          dispatch(setRefreshing(false));
        }
      }
    };

    if (!initialProductsFetchDoneRef.current) {
      initialProductsFetchDoneRef.current = true;
      loadProducts();
    }

    return () => {
      didCancel = true;
    };
  }, [dispatch, products.length, rehydrated, lastProductsSyncAt]);

  // Restore user session on app load
  useEffect(() => {
    const restoreUserSession = async () => {
      try {
        const response = await getUser();
        if (response) {
          dispatch(setUser(response));
        }
      } catch (error) {
        // User not logged in or session expired, this is expected
        console.log("User not authenticated");
      }
    };

    restoreUserSession();
  }, [dispatch]);

  // Initialize WebSocket connection
  useEffect(() => {
    const socket = initializeSocket(currentUser?.token);

    const emitProductsSync = (reason = "unspecified") => {
      const now = Date.now();
      const minIntervalMs = marketplaceRealtimeFlags.productsSyncCoalescingEnabled
        ? Math.max(0, Number(marketplaceRealtimeFlags.productsSyncMinIntervalMs || 0))
        : 0;
      const elapsedMs = now - lastProductsSyncEmitAtRef.current;
      const waitMs = Math.max(0, minIntervalMs - elapsedMs);

      if (productsSyncInFlightRef.current) {
        return false;
      }

      if (waitMs > 0) {
        if (pendingProductsResyncRef.current) {
          clearTimeout(pendingProductsResyncRef.current);
        }
        pendingProductsResyncRef.current = setTimeout(() => {
          emitProductsSync(reason);
        }, waitMs);
        return false;
      }

      productsSyncInFlightRef.current = true;
      lastProductsSyncEmitAtRef.current = Date.now();
      socket.emit("products:sync", {
        correlationId: createCorrelationId("socket-resync"),
        reason,
      });
      setTimeout(() => {
        productsSyncInFlightRef.current = false;
      }, 10000);
      return true;
    };

    const scheduleProductsSync = (reason = "inventory-updated") => {
      if (pendingProductsResyncRef.current) {
        clearTimeout(pendingProductsResyncRef.current);
      }

      const debounceMs = marketplaceRealtimeFlags.productsSyncCoalescingEnabled
        ? Math.max(0, Number(marketplaceRealtimeFlags.productsSyncDebounceMs || 0))
        : 0;

      pendingProductsResyncRef.current = setTimeout(() => {
        emitProductsSync(reason);
      }, debounceMs);
    };

    const shouldResyncProductsForEvent = (eventType) => {
      const normalizedType = String(eventType || "").toLowerCase();
      if (!normalizedType) return false;

      return (
        normalizedType === "marketplace.inventory.synced" ||
        normalizedType.startsWith("marketplace.order.") ||
        normalizedType.startsWith("marketplace.listing.") ||
        normalizedType.startsWith("marketplace.product.")
      );
    };

    const syncMissedEvents = async () => {
      try {
        const since = marketplaceLastEventAt || localStorage.getItem("marketplace:lastEventAt");
        const response = await syncMarketplaceEvents(since || undefined);
        const events = response?.data || [];
        if (events.length) {
          if (marketplaceRealtimeFlags.realtimeSyncEnabled) {
            dispatch(ingestMarketplaceEventsBatch(events));
          }
          localStorage.setItem(
            "marketplace:lastEventAt",
            new Date(events[events.length - 1].occurredAt).toISOString()
          );
        }
      } catch (_error) {
      }
    };

    // Listen for cart updates from backend
    socket.on("cart:updated", (cart) => {
      if (cart?.operationId) {
        dispatch(commitOptimisticOperation({ operationId: cart.operationId }));
      }
      dispatch(updateCartFromSocket(cart));
    });

    socket.on("business:event", (eventEnvelope) => {
      if (marketplaceRealtimeFlags.realtimeSyncEnabled) {
        dispatch(ingestMarketplaceEvent(eventEnvelope));
      }

      if (eventEnvelope?.occurredAt) {
        localStorage.setItem(
          "marketplace:lastEventAt",
          new Date(eventEnvelope.occurredAt).toISOString()
        );
      }

      if (shouldResyncProductsForEvent(eventEnvelope?.eventType)) {
        scheduleProductsSync("business-event");
      }
    });

    socket.on("connect", () => {
      if (currentUser?.token) {
        syncMissedEvents();
      }
    });

    // Listen for cart sync response
    socket.on("cart:synced", (cart) => {
      dispatch(updateCartFromSocket(cart));
    });

    socket.on("cart:error", (error) => {
      dispatch(rollbackOptimisticOperation({ operationId: error?.operationId }));
      console.error("Cart error:", error.message);
    });

    socket.on("products:synced", (productsPayload, metadata = {}) => {
      const latestPayloadSyncMs = getPayloadSyncMs(productsPayload, metadata);
      const currentSyncMs = Math.max(lastKnownProductsSyncAtRef.current, lastSocketSyncAtRef.current);

      if (!shouldApplyIncomingSync({ incomingSyncMs: latestPayloadSyncMs, currentSyncMs })) {
        return;
      }

      if (Array.isArray(productsPayload) && productsPayload.length) {
        hasSocketSyncedProductsRef.current = true;
        dispatch(setProducts(productsPayload));
      }

      const effectiveSyncMs = latestPayloadSyncMs || Date.now();
      lastSocketSyncAtRef.current = effectiveSyncMs;
      lastKnownProductsSyncAtRef.current = effectiveSyncMs;
      productsSyncInFlightRef.current = false;
      dispatch(setProductsSyncedAt(new Date(effectiveSyncMs).toISOString()));
      dispatch(setLoading(false));
      dispatch(setRefreshing(false));
    });

    socket.on("products:error", (error) => {
      console.error("Products error:", error.message);
      productsSyncInFlightRef.current = false;
      dispatch(setError(error.message || "Failed to sync products"));
      dispatch(setLoading(false));
      dispatch(setRefreshing(false));
    });

    socket.on("inventory:updated", () => {
      scheduleProductsSync("inventory-updated");
    });

    // Sync cart and products when component mounts
    socket.emit("cart:sync", { sessionId: localStorage.getItem("sessionId") });
    const initialProductsSyncTimer = setTimeout(() => {
      if (!rehydratedRef.current) {
        return;
      }

      if (!productsCountRef.current && !hasSocketSyncedProductsRef.current) {
        emitProductsSync("initial-bootstrap");
      }
    }, 1200);

    return () => {
      // Cleanup: remove listeners (but keep socket connected)
      socket.off("cart:updated");
      socket.off("cart:synced");
      socket.off("cart:error");
      socket.off("products:synced");
      socket.off("products:error");
      socket.off("business:event");
      socket.off("connect");
      socket.off("inventory:updated");
      if (pendingProductsResyncRef.current) {
        clearTimeout(pendingProductsResyncRef.current);
        pendingProductsResyncRef.current = null;
      }
      clearTimeout(initialProductsSyncTimer);
    };
  }, [dispatch, currentUser?.token, marketplaceLastEventAt]);

  return (
    <LaunchProvider>
      <Router>
        <ScrollToTop />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/customization" element={<Customization />}>
              <Route path="create" element={<CreateCustomization />} />
            </Route>
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/login" element={<Login />} />
            <Route path="/track-order" element={<TrackOrder />} />
            <Route path="/contact" element={<ContactUs />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/waitlist" element={<WaitlistForm />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </Router>
    </LaunchProvider>
  );
}

export default App;
