import api from "./api";

export const createOrder = async (payload) => {
  return api.post("/api/orders/create", payload);
};

export const fetchUserOrders = async () => {
  const sessionId = localStorage.getItem("sessionId");
  return api.post("/api/orders/user-orders", { sessionId });
};

export const trackOrder = async (orderNumber, email) => {
  return api.post("/api/orders/track", { orderNumber, email });
};
