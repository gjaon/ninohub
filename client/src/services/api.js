import axios from "axios";

// Create axios instance with default config
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any common headers here
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const errorMessage =
      error.response?.data?.message ||
      error.message ||
      "An error occurred";
    return Promise.reject(new Error(errorMessage));
  }
);

export default api;
