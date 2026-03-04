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
  loading: false,
  error: null,
};

const productsSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    setProducts: (state, action) => {
      state.items = action.payload;
      state.filteredItems = action.payload;
      state.categories = Array.from(
        new Set(action.payload.map((item) => item.category).filter(Boolean))
      ).sort();
      state.loading = false;
      state.error = null;
    },
    filterByCategory: (state, action) => {
      state.selectedCategory = action.payload;
      if (action.payload === "All") {
        state.filteredItems = state.items;
      } else {
        state.filteredItems = state.items.filter(
          (item) => item.category === action.payload
        );
      }
    },
    searchProducts: (state, action) => {
      const searchTerm = action.payload.toLowerCase();
      state.filteredItems = state.items.filter(
        (item) =>
          item.name.toLowerCase().includes(searchTerm) ||
          item.description.toLowerCase().includes(searchTerm)
      );
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
