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
const isLocalHost = (hostname) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "0.0.0.0" ||
  hostname?.endsWith(".local");

const resolveApiBaseUrl = () => {
  const explicit = (process.env.REACT_APP_API_URL || "").trim();
  const browserOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const browserHostname =
    typeof window !== "undefined" ? window.location?.hostname : "";

  // Defensive: if the env var was baked in pointing at localhost but the page
  // is actually being viewed from a non-localhost host (i.e. the dev .env
  // leaked into a production build), ignore the env var and use the page's
  // own origin. This prevents the entire site from being broken on every
  // device but the build machine.
  if (explicit) {
    let explicitHost = "";
    try {
      explicitHost = new URL(explicit).hostname;
    } catch (_e) {
      explicitHost = "";
    }
    const explicitIsLocal = isLocalHost(explicitHost);
    const browserIsLocal = isLocalHost(browserHostname);
    if (explicitIsLocal && !browserIsLocal && browserOrigin) {
      // eslint-disable-next-line no-console
      console.warn(
        `[api] Ignoring REACT_APP_API_URL=${explicit} because the page is served from ${browserOrigin}. Falling back to same-origin.`
      );
      return browserOrigin.replace(/\/+$/, "");
    }
    return explicit.replace(/\/+$/, "");
  }

  if (browserOrigin) {
    return browserOrigin.replace(/\/+$/, "");
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
