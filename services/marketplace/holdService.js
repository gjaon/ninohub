const InventoryHold = require("../../models/inventoryHoldModel");
const { publishEvent } = require("./businessEventBus");

const releaseExpiredHolds = async () => {
  const now = new Date();
  const expired = await InventoryHold.find({
    status: "active",
    expiresAt: { $lt: now },
  }).limit(100);

  for (const hold of expired) {
    hold.status = "expired";
    hold.auditTrail.push({
      action: "hold_expired_released",
      occurredAt: new Date(),
      metadata: {},
    });
    await hold.save();

    await publishEvent({
      eventType: "marketplace.hold.expired",
      source: "marketplace.holdMaintenance",
      buyerId: hold.buyerId,
      correlationId: hold.correlationId,
      payload: {
        holdId: hold.holdId,
      },
    });
  }

  return expired.length;
};

module.exports = {
  releaseExpiredHolds,
};
