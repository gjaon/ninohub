import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  items: [],
  filteredItems: [],
  categories: [
    "Rings",
    "Necklaces",
    "Bracelets",
    "Earrings",
    "Watches",
    "Custom",
  ],
  selectedCategory: "All",
  searchTerm: "",
  loading: false,
  error: null,
};

const normalizeSearchText = (item = {}) => {
  const variantText = Array.isArray(item?.variants)
    ? item.variants
        .map((variant) => `${variant?.name || ""} ${variant?.variantId || variant?.id || ""}`)
        .join(" ")
    : "";

  return [
    item?.name,
    item?.description,
    item?.category,
    item?.groupName,
    item?.sku,
    variantText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const applyFilters = (state) => {
  const normalizedSearch = String(state.searchTerm || "").trim().toLowerCase();
  state.filteredItems = state.items.filter((item) => {
    const categoryMatch =
      state.selectedCategory === "All" || item.category === state.selectedCategory;

    if (!categoryMatch) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return normalizeSearchText(item).includes(normalizedSearch);
  });
};

const productsSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    setProducts: (state, action) => {
      state.items = action.payload;
      state.categories = Array.from(
        new Set(action.payload.map((item) => item.category).filter(Boolean))
      ).sort();
      applyFilters(state);
      state.loading = false;
      state.error = null;
    },
    filterByCategory: (state, action) => {
      state.selectedCategory = action.payload;
      applyFilters(state);
    },
    searchProducts: (state, action) => {
      state.searchTerm = action.payload;
      applyFilters(state);
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
    },
  },
});

export const {
  setProducts,
  filterByCategory,
  searchProducts,
  setLoading,
  setError,
} = productsSlice.actions;
export default productsSlice.reducer;
