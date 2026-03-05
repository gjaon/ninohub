import reducer, {
  ingestMarketplaceEvent,
  ingestMarketplaceEventsBatch,
  setProductsSyncedAt,
} from "./marketplaceSyncSlice";

describe("marketplaceSyncSlice", () => {
  it("suppresses duplicate provider events by eventId", () => {
    const event = {
      eventId: "evt-1",
      eventType: "marketplace.order.shipped",
      occurredAt: "2026-03-05T12:00:00.000Z",
      payload: { orderNumber: "ORD-1", status: "shipped" },
    };

    let state = reducer(undefined, ingestMarketplaceEvent(event));
    state = reducer(state, ingestMarketplaceEvent(event));

    expect(state.observability.totalEventsApplied).toBe(1);
    expect(state.observability.duplicateEventsSuppressed).toBe(1);
    expect(state.ordersByNumber["ORD-1"].status).toBe("shipped");
  });

  it("keeps fresher products sync timestamp during merge updates", () => {
    let state = reducer(undefined, setProductsSyncedAt("2026-03-05T12:00:10.000Z"));
    state = reducer(state, setProductsSyncedAt("2026-03-05T12:00:01.000Z"));

    expect(state.syncMeta.lastProductsSyncAt).toBe("2026-03-05T12:00:10.000Z");
  });

  it("applies sync batch and advances server sync marker", () => {
    const state = reducer(
      undefined,
      ingestMarketplaceEventsBatch([
        {
          eventId: "evt-2",
          eventType: "marketplace.order.processing",
          occurredAt: "2026-03-05T12:01:00.000Z",
          payload: { orderNumber: "ORD-2", status: "processing" },
        },
      ])
    );

    expect(state.ordersByNumber["ORD-2"].status).toBe("processing");
    expect(state.syncMeta.lastServerSyncAt).toBeTruthy();
  });
});
