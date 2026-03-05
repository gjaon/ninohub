import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { fetchUserOrders, trackOrder } from "../services/orders";
import {
  fetchMarketplaceOrders,
  trackMarketplaceOrder,
  syncMarketplaceEvents,
} from "../services/marketplace";
import { getSocket } from "../services/socket";
import {
  ingestMarketplaceEvent,
  ingestMarketplaceEventsBatch,
  replaceMarketplaceOrders,
} from "../redux/slices/marketplaceSyncSlice";
import "./TrackOrder.css";

const TrackOrder = () => {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((state) => state.user);
  const marketplaceLastEventAt = useSelector((state) => state.marketplaceSync?.syncMeta?.lastEventAt);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const orderFromUrl = queryParams.get("order");

  const [orderNumber, setOrderNumber] = useState(orderFromUrl || "");
  const [email, setEmail] = useState("");
  const [trackingResult, setTrackingResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userOrders, setUserOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const trackingOrderNumberRef = React.useRef(null);
  const [viewMode, setViewMode] = useState(
    isAuthenticated ? "my-orders" : "track"
  );

  const normalizeOrderStatus = React.useCallback((status) => {
    const normalized = String(status || "").toLowerCase();
    const map = {
      pending: "placed",
      paid: "payment_confirmed",
      cancelled: "rejected",
      failed: "rejected",
    };

    return map[normalized] || normalized;
  }, []);

  const buildTimeline = React.useCallback((order) => {
    const createdDate = new Date(order.createdAt);
    const baseDate = createdDate.toLocaleDateString();
    const baseTime = createdDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const steps = [
      "placed",
      "payment_confirmed",
      "accepted",
      "processing",
      "shipped",
      "delivered",
    ];
    const statusIndex = steps.indexOf(normalizeOrderStatus(order.status));
    const timeline = steps.map((status, index) => ({
      status:
        status === "payment_confirmed"
          ? "Payment Confirmed"
          : status === "accepted"
            ? "Accepted"
          : status.charAt(0).toUpperCase() + status.slice(1),
      date: baseDate,
      time: baseTime,
      completed: index <= statusIndex && statusIndex !== -1,
      current: index === statusIndex,
    }));

    return timeline;
  }, [normalizeOrderStatus]);

  const enrichOrder = React.useCallback((order) => {
    const estimatedDelivery = new Date(
      new Date(order.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000
    ).toLocaleDateString();

    return {
      ...order,
      estimatedDelivery,
      timeline: buildTimeline(order),
    };
  }, [buildTimeline]);

  const mapOrdersResponse = React.useCallback(
    (response) => {
      const orders = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      return orders.map(enrichOrder);
    },
    [enrichOrder]
  );

  const loadOrdersWithFallback = React.useCallback(async () => {
    try {
      const marketplaceResponse = await fetchMarketplaceOrders();
      return mapOrdersResponse(marketplaceResponse);
    } catch (_marketplaceError) {
      const fallbackResponse = await fetchUserOrders();
      return mapOrdersResponse(fallbackResponse);
    }
  }, [mapOrdersResponse]);

  const refreshOrders = React.useCallback(
    async ({ silent = false } = {}) => {
      setOrdersLoading(true);
      try {
        const enriched = await loadOrdersWithFallback();
        setUserOrders(enriched);
        dispatch(replaceMarketplaceOrders(enriched));

        if (trackingOrderNumberRef.current) {
          const refreshedCurrent = enriched.find(
            (order) => order.orderNumber === trackingOrderNumberRef.current
          );
          if (refreshedCurrent) {
            setTrackingResult(refreshedCurrent);
          }
        }

        if (!silent) {
          toast.success("Orders refreshed");
        }
      } catch (error) {
        toast.error(error.message || "Failed to load orders");
      } finally {
        setOrdersLoading(false);
      }
    },
    [loadOrdersWithFallback]
  );

  React.useEffect(() => {
    trackingOrderNumberRef.current = trackingResult?.orderNumber || null;
  }, [trackingResult]);

  React.useEffect(() => {
    if (isAuthenticated) {
      refreshOrders({ silent: true });

      const socket = getSocket();
      const onBusinessEvent = async (eventEnvelope) => {
        const eventType = String(eventEnvelope?.eventType || "").toLowerCase();
        const isOrderRealtimeEvent =
          eventType.startsWith("marketplace.order.") ||
          eventType === "marketplace.provider.event";

        dispatch(ingestMarketplaceEvent(eventEnvelope));

        if (!isOrderRealtimeEvent) {
          return;
        }

        await refreshOrders({ silent: true });
      };

      socket?.on("business:event", onBusinessEvent);

      syncMarketplaceEvents(marketplaceLastEventAt || localStorage.getItem("marketplace:lastEventAt") || undefined)
        .then(async (eventSync) => {
          const events = eventSync?.data || [];
          if (events.length) {
            dispatch(ingestMarketplaceEventsBatch(events));
            localStorage.setItem(
              "marketplace:lastEventAt",
              new Date(events[events.length - 1].occurredAt).toISOString()
            );
            await refreshOrders({ silent: true });
          }
        })
        .catch(() => null);

      return () => {
        socket?.off("business:event", onBusinessEvent);
      };
    }
  }, [dispatch, isAuthenticated, marketplaceLastEventAt, refreshOrders]);

  React.useEffect(() => {
    if (orderFromUrl && isAuthenticated) {
      const order = userOrders.find((o) => o.orderNumber === orderFromUrl);
      if (order) {
        setTrackingResult(order);
        setViewMode("track");
      }
    }
  }, [orderFromUrl, isAuthenticated, userOrders]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!orderNumber || (!isAuthenticated && !email)) {
      toast.error("Please enter all required fields");
      return;
    }

    setLoading(true);

    try {
      let response;
      try {
        response = await trackMarketplaceOrder(orderNumber);
      } catch (_marketplaceError) {
        response = await trackOrder(orderNumber, email);
      }

      setTrackingResult(enrichOrder(response));
      toast.success("Order found!");
    } catch (error) {
      toast.error(error.message || "Order not found");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setOrderNumber("");
    setEmail("");
    setTrackingResult(null);
    setViewMode(isAuthenticated ? "my-orders" : "track");
  };

  const handleViewOrder = (order) => {
    setTrackingResult(order);
    setViewMode("track");
  };

  const handleRefreshOrders = async () => {
    if (!isAuthenticated) {
      return;
    }
    await refreshOrders();
  };

  return (
    <div className="track-order-page">
      <div className="track-order-container">
        <div className="track-order-header">
          <h1>Track Your Order</h1>
          <p>
            {isAuthenticated
              ? "View all your orders or track a specific order"
              : "Enter your order details to track your package"}
          </p>
        </div>

        {isAuthenticated && !trackingResult && (
          <div className="view-toggle">
            <button
              className={`toggle-btn ${
                viewMode === "my-orders" ? "active" : ""
              }`}
              onClick={() => setViewMode("my-orders")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              My Orders
            </button>
            <button
              className={`toggle-btn ${viewMode === "track" ? "active" : ""}`}
              onClick={() => setViewMode("track")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Track Order
            </button>
          </div>
        )}

        {isAuthenticated && viewMode === "my-orders" && !trackingResult ? (
          <div className="user-orders-list">
            <div className="orders-list-header">
              <h2>Your Orders</h2>
              <button className="btn-new-search" onClick={handleRefreshOrders}>
                Refresh Orders
              </button>
            </div>
            {ordersLoading ? (
              <p>Loading orders...</p>
            ) : userOrders.length > 0 ? (
              <div className="orders-grid">
                {userOrders.map((order, index) => (
                  <div key={index} className="order-summary-card">
                    <div className="order-summary-header">
                      <h3>#{order.orderNumber}</h3>
                      <div
                        className={`status-badge status-${order.status
                          .toLowerCase()
                          .replace(" ", "-")}`}
                      >
                        {order.status}
                      </div>
                    </div>
                    <div className="order-summary-items">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="summary-item">
                          <span>{item.productName || item.name}</span>
                          <span>₦{item.price.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="order-summary-footer">
                      <div className="delivery-info">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="1" y="3" width="15" height="13" />
                          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                          <circle cx="5.5" cy="18.5" r="2.5" />
                          <circle cx="18.5" cy="18.5" r="2.5" />
                        </svg>
                        <span>Est. delivery: {order.estimatedDelivery}</span>
                      </div>
                      <button
                        className="btn-view-details"
                        onClick={() => handleViewOrder(order)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-orders">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                <p>No orders found</p>
              </div>
            )}
          </div>
        ) : !trackingResult ? (
          <form className="track-order-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="orderNumber">Order Number</label>
              <input
                type="text"
                id="orderNumber"
                name="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g. ORD123456789XYZ"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required={!isAuthenticated}
              />
            </div>

            <button type="submit" className="btn-track" disabled={loading}>
              {loading ? "Searching..." : "Track Order"}
            </button>

            <div className="help-text">
              <p>
                Can't find your order number? Check your confirmation email or{" "}
                <a href="/contact">contact us</a>
              </p>
            </div>
          </form>
        ) : (
          <div className="tracking-results">
            <div className="results-header">
              <div className="order-info">
                <h2>Order #{trackingResult.orderNumber}</h2>
                <div
                  className={`status-badge status-${trackingResult.status
                    .toLowerCase()
                    .replace(" ", "-")}`}
                >
                  {trackingResult.status}
                </div>
              </div>
              <div className="results-actions">
                {isAuthenticated && (
                  <button className="btn-new-search" onClick={handleRefreshOrders}>
                    Refresh Orders
                  </button>
                )}
                <button className="btn-new-search" onClick={handleReset}>
                  Track Another Order
                </button>
              </div>
            </div>

            <div className="delivery-estimate">
              <div className="estimate-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="1" y="3" width="15" height="13" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </div>
              <div className="estimate-text">
                <h3>Estimated Delivery</h3>
                <p className="estimate-date">
                  {trackingResult.estimatedDelivery}
                </p>
              </div>
            </div>

            <div className="tracking-timeline">
              <h3>Order Timeline</h3>
              <div className="timeline">
                {trackingResult.timeline.map((item, index) => (
                  <div
                    key={index}
                    className={`timeline-item ${
                      item.completed ? "completed" : ""
                    } ${item.current ? "current" : ""}`}
                  >
                    <div className="timeline-marker">
                      {item.completed && !item.current && (
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                        >
                          <path
                            d="M7 10L9 12L13 8"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      {item.current && <div className="pulse-dot"></div>}
                    </div>
                    <div className="timeline-content">
                      <h4>{item.status}</h4>
                      <p className="timeline-date">
                        {item.date} {item.time !== "TBD" && `at ${item.time}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-items">
              <h3>Order Items</h3>
              {trackingResult.items.map((item, index) => (
                <div key={index} className="order-item">
                  <div className="item-details">
                    <h4>{item.productName || item.name}</h4>
                    <p>Quantity: {item.quantity}</p>
                  </div>
                  <div className="item-price">
                    ₦{item.price.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <div className="tracking-help">
              <p>
                Need help with your order?{" "}
                <a href="/contact">Contact our support team</a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackOrder;
