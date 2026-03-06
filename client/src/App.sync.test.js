import { getPayloadSyncMs, shouldApplyIncomingSync, toMs } from "./utils/productsFreshness";

describe("products freshness arbitration", () => {
  it("accepts newer payload timestamps and rejects older ones", () => {
    expect(
      shouldApplyIncomingSync({
        incomingSyncMs: toMs("2026-03-05T12:00:10.000Z"),
        currentSyncMs: toMs("2026-03-05T12:00:09.000Z"),
      })
    ).toBe(true);

    expect(
      shouldApplyIncomingSync({
        incomingSyncMs: toMs("2026-03-05T12:00:08.000Z"),
        currentSyncMs: toMs("2026-03-05T12:00:09.000Z"),
      })
    ).toBe(false);
  });

  it("derives payload sync timestamp from the freshest product", () => {
    const syncMs = getPayloadSyncMs([
      { syncedAt: "2026-03-05T12:00:05.000Z" },
      { updatedAt: "2026-03-05T12:00:11.000Z" },
    ]);

    expect(syncMs).toBe(toMs("2026-03-05T12:00:11.000Z"));
  });
});
