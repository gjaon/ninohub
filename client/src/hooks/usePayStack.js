import { useState } from "react";
import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:5000";

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
