import api from "./api";

export const fetchProducts = async () => {
  return api.get("/api/products");
};
