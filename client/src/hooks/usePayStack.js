import { useState } from "react";
import axios from "axios";

const isLocalHost = (hostname) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "0.0.0.0" ||
  hostname?.endsWith(".local");

const resolveBaseUrl = () => {
  const explicit = (process.env.REACT_APP_SERVER_URL || "").trim();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const hostname =
    typeof window !== "undefined" ? window.location?.hostname : "";
  if (explicit) {
    let explicitHost = "";
    try {
      explicitHost = new URL(explicit).hostname;
    } catch (_e) {}
    if (isLocalHost(explicitHost) && !isLocalHost(hostname) && origin) {
      return origin.replace(/\/+$/, "");
    }
    return explicit.replace(/\/+$/, "");
  }
  return (origin || "http://localhost:5000").replace(/\/+$/, "");
};

const API_BASE_URL = resolveBaseUrl();

export const usePayStack = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const initializePayment = async (amount, email) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/orders/initialize-payment`, {
        amount,
        email,
        sessionId: localStorage.getItem("sessionId"),
      });

      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyPaymentAndCreateOrder = async (reference, shippingAddress) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/orders/verify-payment`, {
        reference,
        shippingAddress,
        sessionId: localStorage.getItem("sessionId"),
      });

      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getOrder = async (orderId) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/orders/get/${orderId}`, {
        sessionId: localStorage.getItem("sessionId"),
      });

      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getUserOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/api/orders/user-orders`, {
        sessionId: localStorage.getItem("sessionId"),
      });

      return response.data;
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    initializePayment,
    verifyPaymentAndCreateOrder,
    getOrder,
    getUserOrders,
    loading,
    error,
  };
};

export default usePayStack;
