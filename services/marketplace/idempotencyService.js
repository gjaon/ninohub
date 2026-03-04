const PublicIdempotencyKey = require("../../models/publicIdempotencyKeyModel");
const { hashValue } = require("./cryptoService");

const buildBuyerActionKey = ({ buyerId, action, scope }) =>
  `${buyerId}:${action}:${scope}`;

const getFingerprint = (payload) => hashValue(JSON.stringify(payload || {}));

const reserveIdempotency = async ({
  key,
  clientId,
  buyerActionKey,
  payload,
  ttlMinutes = 30,
}) => {
  const requestFingerprint = getFingerprint(payload);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const existing = await PublicIdempotencyKey.findOne({ key, clientId });
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new Error("Idempotency key reuse with different payload");
    }

    return {
      created: false,
      record: existing,
    };
  }

  const record = await PublicIdempotencyKey.create({
    key,
    clientId,
    buyerActionKey,
    requestFingerprint,
    status: "processing",
    expiresAt,
  });

  return {
    created: true,
    record,
  };
};

const markIdempotencySuccess = async ({ id, responsePayload }) => {
  return PublicIdempotencyKey.findByIdAndUpdate(
    id,
    {
      $set: {
        status: "succeeded",
        responsePayload,
        errorPayload: null,
      },
    },
    { new: true }
  );
};

const markIdempotencyFailure = async ({ id, errorPayload }) => {
  return PublicIdempotencyKey.findByIdAndUpdate(
    id,
    {
      $set: {
        status: "failed",
        errorPayload,
      },
    },
    { new: true }
  );
};

module.exports = {
  buildBuyerActionKey,
  reserveIdempotency,
  markIdempotencySuccess,
  markIdempotencyFailure,
};
