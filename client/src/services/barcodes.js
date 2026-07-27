import api from "./api";

export const createBarcode = async (payload) => {
  return api.post("/api/barcodes", payload);
};

// Uploads one image or video to S3 and returns its URL. Media goes up one file
// per request so a barcode's files never have to share a single request body.
// Rejects with `storageDisabled` set when the server has no S3 configured, so
// the caller can fall back to embedding the file in the barcode itself.
export const uploadBarcodeMedia = async ({ dataUrl, kind, fileName }) => {
  try {
    return await api.post("/api/barcodes/uploads", { dataUrl, kind, fileName });
  } catch (error) {
    if (/not configured/i.test(error.message || "")) {
      error.storageDisabled = true;
    }
    throw error;
  }
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
