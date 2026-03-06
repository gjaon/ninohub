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
  refreshing: false,
  error: null,
  lastAppliedSyncAt: null,
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
      const payloadItems = Array.isArray(action.payload) ? action.payload : action.payload?.items;
      state.items = Array.isArray(payloadItems) ? payloadItems : [];
      state.categories = Array.from(
        new Set(state.items.map((item) => item.category).filter(Boolean))
      ).sort();
      applyFilters(state);
      state.loading = false;
      state.refreshing = false;
      state.error = null;

      const incomingSyncAt =
        (Array.isArray(state.items)
          ? state.items
              .map((item) => new Date(item?.syncedAt || item?.updatedAt || 0).getTime() || 0)
              .sort((a, b) => b - a)[0]
          : 0) || 0;
      if (incomingSyncAt > 0) {
        state.lastAppliedSyncAt = new Date(incomingSyncAt).toISOString();
      }
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
      if (action.payload) {
        state.refreshing = false;
      }
    },
    setRefreshing: (state, action) => {
      state.refreshing = action.payload;
      if (action.payload) {
        state.loading = false;
      }
    },
    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
      state.refreshing = false;
    },
  },
});

export const {
  setProducts,
  filterByCategory,
  searchProducts,
  setLoading,
  setRefreshing,
  setError,
} = productsSlice.actions;
export default productsSlice.reducer;
