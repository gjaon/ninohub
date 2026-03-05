import io from "socket.io-client";

let socket = null;

const initializeSocket = (token) => {
  if (socket) return socket;

  const socketUrl = process.env.REACT_APP_SERVER_URL || "https://www.ninohub.com";
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
