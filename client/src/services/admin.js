import api from "./api";

export const getFallbackQueue = async (params = {}) => api.get("/api/admin/fallbacks", { params });
export const getFallbackById = async (fallbackId) => api.get(`/api/admin/fallbacks/${fallbackId}`);
export const markFallbackReviewed = async (fallbackId) =>
  api.post(`/api/admin/fallbacks/${fallbackId}/review`, {});
export const addFallbackNote = async (fallbackId, note) =>
  api.post(`/api/admin/fallbacks/${fallbackId}/notes`, { note });
export const retryFallback = async (fallbackId) => api.post(`/api/admin/fallbacks/${fallbackId}/retry`, {});
export const resolveFallback = async (fallbackId, resolutionNote) =>
  api.post(`/api/admin/fallbacks/${fallbackId}/resolve`, { resolutionNote });

export const getAdminUsers = async (params = {}) => api.get("/api/admin/users", { params });
export const getAdminWaitlist = async (params = {}) => api.get("/api/admin/waitlist", { params });
export const updateAdminWaitlistStatus = async (id, status) =>
  api.patch(`/api/admin/waitlist/${id}/status`, { status });

export const sendAdminCampaign = async (payload) => api.post("/api/admin/campaigns/send", payload);
export const getCampaignDeliveryLogs = async (params = {}) =>
  api.get("/api/admin/campaigns/delivery-logs", { params });
