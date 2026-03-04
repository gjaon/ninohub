import api from "./api";

export const initializeMarketplaceCheckout = async (payload = {}, idempotencyKey, correlationId) => {
  console.log({ payload, idempotencyKey, correlationId });
  return api.post("/api/marketplace/checkout/initialize", payload, {
    headers: {
      "x-idempotency-key": idempotencyKey,
      "x-correlation-id": correlationId,
    },
  });
};

export const verifyMarketplaceCheckout = async ({ reference, status, shippingAddress }) => {
  return api.post("/api/marketplace/checkout/verify", {
    reference,
    status,
    shippingAddress,
  });
};

export const syncMarketplaceEvents = async (sinceIso) => {
  const query = sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : "";
  return api.get(`/api/marketplace/events/sync${query}`);
};

export const fetchMarketplaceOrders = async () => {
  return api.get("/api/marketplace/orders");
};

export const trackMarketplaceOrder = async (orderNumber) => {
  return api.post("/api/marketplace/orders/track", {
    orderNumber,
  });
};
