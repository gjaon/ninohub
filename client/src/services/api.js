import axios from "axios";

// Create axios instance with default config
// const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const RAW_API_BASE_URL =
  process.env.REACT_APP_API_URL || "https://ninohub.com/";
// Strip trailing slashes so that `baseURL + "/api/..."` never produces a
// double slash (e.g. `https://ninohub.com//api/...`). Chromium-based browsers
// quietly normalize this, but Safari — including the in-app browser opened by
// the iOS Camera/QR scanner — sends it literally, and most edge proxies
// respond with a redirect or 404 that surfaces in axios as `Network Error`.
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");

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
