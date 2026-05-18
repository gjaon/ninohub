import io from "socket.io-client";

let socket = null;

const isLocalHost = (hostname) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "0.0.0.0" ||
  hostname?.endsWith(".local");

const resolveSocketUrl = () => {
  const explicit = (process.env.REACT_APP_SERVER_URL || "").trim();
  const browserOrigin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const browserHostname =
    typeof window !== "undefined" ? window.location?.hostname : "";

  if (explicit) {
    let explicitHost = "";
    try {
      explicitHost = new URL(explicit).hostname;
    } catch (_e) {
      explicitHost = "";
    }
    if (
      isLocalHost(explicitHost) &&
      !isLocalHost(browserHostname) &&
      browserOrigin
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `[socket] Ignoring REACT_APP_SERVER_URL=${explicit} because the page is served from ${browserOrigin}. Falling back to same-origin.`
      );
      return browserOrigin.replace(/\/+$/, "");
    }
    return explicit.replace(/\/+$/, "");
  }
  if (browserOrigin) return browserOrigin.replace(/\/+$/, "");
  return "https://ninohub.onrender.com";
};

const initializeSocket = (token) => {
  if (socket) return socket;

  const socketUrl = resolveSocketUrl();
  // const socketUrl = process.env.REACT_APP_SERVER_URL || "http://localhost:5001";
  
  // Get or create session ID
  let sessionId = localStorage.getItem("sessionId");
  if (!sessionId) {
    sessionId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem("sessionId", sessionId);
  }

  socket = io(socketUrl, {
    auth: {
      token: token || null,
      sessionId,
    },
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    console.log("Connected to WebSocket server");
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from WebSocket server");
  });

  socket.on("connect_error", (error) => {
    console.error("WebSocket connection error:", error);
  });

  return socket;
};

const getSocket = () => {
  return socket;
};

const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export { initializeSocket, getSocket, disconnectSocket };
