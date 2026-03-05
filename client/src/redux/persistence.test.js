import { migrations } from "./persistence";

describe("redux persistence migrations", () => {
  it("normalizes legacy persisted state for version 1", () => {
    const migrated = migrations[1]({
      products: {
        items: [{ id: "p1" }],
      },
      marketplaceSync: {
        syncMeta: { fallbackPollingActive: 1 },
      },
    });

    expect(Array.isArray(migrated.products.filteredItems)).toBe(true);
    expect(migrated.products.loading).toBe(false);
    expect(migrated.marketplaceSync.schemaVersion).toBe(1);
    expect(migrated.marketplaceSync.syncMeta.fallbackPollingActive).toBe(true);
  });
});
