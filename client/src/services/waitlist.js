import api from "./api";

// Join waitlist
export const joinWaitlist = async (waitlistData) => {
  return api.post("/api/waitlist/join", {
    name: waitlistData.name,
    phone: waitlistData.phone,
    email: waitlistData.email || null,
  });
};

// Get waitlist total count
export const getWaitlistCount = async () => {
  return api.get("/api/waitlist/count");
};

// Get all waitlist entries (admin only)
export const getWaitlistEntries = async () => {
  return api.get("/api/waitlist");
};

// Update waitlist entry status (admin only)
export const updateWaitlistStatus = async (id, status) => {
  return api.patch(`/api/waitlist/${id}/status`, { status });
};
