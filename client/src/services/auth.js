import api from "./api";

// Register user
export const registerUser = async (userData) => {
  // Include sessionId for cart migration
  const sessionId = localStorage.getItem("sessionId");
  return api.post("/api/users/register", { ...userData, sessionId });
};

// Login user
export const loginUser = async (credentials) => {
  // Include sessionId for cart migration
  const sessionId = localStorage.getItem("sessionId");
  return api.post("/api/users/login", { ...credentials, sessionId });
};

// Logout user
export const logoutUser = async () => {
  return api.get("/api/users/logout");
};

// Get current user
export const getUser = async () => {
  return api.get("/api/users/getuser");
};

// Check if user is logged in
export const checkLoginStatus = async () => {
  return api.get("/api/users/loggedin");
};

// Update user profile
export const updateUser = async (userData) => {
  return api.patch("/api/users/updateuser", userData);
};

// Change password
export const changePassword = async (passwordData) => {
  return api.patch("/api/users/changepassword", passwordData);
};

// Refresh access token
export const refreshAccessToken = async () => {
  return api.post("/api/users/refresh");
};
