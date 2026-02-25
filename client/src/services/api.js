import axios from "axios";

// Create axios instance with default config
// const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const API_BASE_URL = process.env.REACT_APP_API_URL || "https://www.ninohub.com";

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
    const token = localStorage.getItem("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
