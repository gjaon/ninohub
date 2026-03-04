const test = require("node:test");
const assert = require("node:assert/strict");

const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require("./helpers/db");
const {
  buildBuyerActionKey,
  reserveIdempotency,
} = require("../services/marketplace/idempotencyService");

test.before(async () => {
  await connectTestDb();
});

test.after(async () => {
  await disconnectTestDb();
});

test.beforeEach(async () => {
  await clearTestDb();
});

test("reserves idempotency per buyer action and returns existing record for same payload", async () => {
  const buyerActionKey = buildBuyerActionKey({
    buyerId: "buyer-1",
    action: "checkout-initialize",
    scope: "cart-1",
  });

  const first = await reserveIdempotency({
    key: "idem-1",
    clientId: "buyer:1",
    buyerActionKey,
    payload: { cartId: "cart-1", itemCount: 2 },
  });

  const second = await reserveIdempotency({
    key: "idem-1",
    clientId: "buyer:1",
    buyerActionKey,
    payload: { cartId: "cart-1", itemCount: 2 },
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(String(first.record._id), String(second.record._id));
});

test("rejects idempotency key reuse with different payload", async () => {
  const buyerActionKey = buildBuyerActionKey({
    buyerId: "buyer-1",
    action: "checkout-initialize",
    scope: "cart-1",
  });

  await reserveIdempotency({
    key: "idem-2",
    clientId: "buyer:1",
    buyerActionKey,
    payload: { cartId: "cart-1", itemCount: 2 },
  });

  await assert.rejects(
    () =>
      reserveIdempotency({
        key: "idem-2",
        clientId: "buyer:1",
        buyerActionKey,
        payload: { cartId: "cart-1", itemCount: 5 },
      }),
    /different payload/
  );
});
