import axios from "axios";

// Create axios instance with default config.
//
// In the browser we deliberately prefer a SAME-ORIGIN base URL. The React app
// and the Express API are served from the same host in production, so calling
// `/api/...` relative to `window.location.origin` avoids an entire class of
// mobile-only bugs:
//   * www vs apex redirects (iOS Safari + cellular sometimes resolves
//     `ninohub.com` to `www.ninohub.com`, which then makes a hardcoded
//     `https://ninohub.com/api/...` request cross-origin and triggers CORS
//     preflight failures that surface as "Network Error").
//   * http vs https mismatches via captive portals / carrier proxies.
//   * Trailing-slash double-slash issues (`https://host//api/...`).
//
// An explicit `REACT_APP_API_URL` still wins when set (useful for split
// deployments where the API lives on a different host).
// const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5001";
const resolveApiBaseUrl = () => {
  const explicit = process.env.REACT_APP_API_URL;
  if (explicit && explicit.trim()) {
    return explicit.trim().replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  // SSR / test fallback.
  return "https://ninohub.com";
};

const API_BASE_URL = resolveApiBaseUrl();

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
