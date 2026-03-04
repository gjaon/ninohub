const { EventEmitter } = require("events");
const { v4: uuidv4 } = require("uuid");
const BusinessEvent = require("../../models/businessEventModel");

const bus = new EventEmitter();

const normalizeEnvelope = ({
  eventId,
  eventType,
  occurredAt,
  source,
  correlationId,
  payloadVersion,
  payload,
  buyerId,
}) => ({
  eventId: eventId || uuidv4(),
  eventType,
  occurredAt: occurredAt || new Date().toISOString(),
  source,
  correlationId: correlationId || null,
  payloadVersion: payloadVersion || "1.0",
  payload,
  buyerId: buyerId || null,
});

const publishEvent = async (eventInput) => {
  const envelope = normalizeEnvelope(eventInput);

  await BusinessEvent.create({
    ...envelope,
    occurredAt: new Date(envelope.occurredAt),
  });

  bus.emit("business:event", envelope);
  return envelope;
};

const subscribe = (handler) => {
  bus.on("business:event", handler);
  return () => bus.off("business:event", handler);
};

module.exports = {
  normalizeEnvelope,
  publishEvent,
  subscribe,
};
