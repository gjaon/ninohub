import reducer, {
  filterByCategory,
  searchProducts,
  setLoading,
  setRefreshing,
  setProducts,
} from "./productsSlice";

describe("productsSlice hydration-first states", () => {
  it("keeps loading false when entering non-blocking refresh", () => {
    let state = reducer(undefined, setLoading(true));
    expect(state.loading).toBe(true);

    state = reducer(state, setRefreshing(true));
    expect(state.refreshing).toBe(true);
    expect(state.loading).toBe(false);
  });

  it("preserves selected category/search semantics across setProducts", () => {
    let state = reducer(undefined, filterByCategory("Rings"));
    state = reducer(state, searchProducts("gold"));

    state = reducer(
      state,
      setProducts([
        { id: "1", name: "Gold Ring", category: "Rings", description: "Classic" },
        { id: "2", name: "Silver Bracelet", category: "Bracelets", description: "Modern" },
      ])
    );

    expect(state.selectedCategory).toBe("Rings");
    expect(state.searchTerm).toBe("gold");
    expect(state.filteredItems.length).toBe(1);
    expect(state.filteredItems[0].id).toBe("1");
  });
});
