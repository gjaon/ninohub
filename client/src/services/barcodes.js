import api from "./api";

export const createBarcode = async (payload) => {
  return api.post("/api/barcodes", payload);
};

export const updateBarcode = async (slug, payload) => {
  return api.put(`/api/barcodes/${slug}`, payload);
};

export const fetchBarcode = async (slug) => {
  return api.get(`/api/barcodes/${slug}`);
};

export const listBarcodes = async (limit = 50) => {
  return api.get(`/api/barcodes?limit=${encodeURIComponent(limit)}`);
};

export const deleteBarcode = async (slug) => {
  return api.delete(`/api/barcodes/${slug}`);
};
