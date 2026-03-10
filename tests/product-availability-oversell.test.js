const test = require("node:test");
const assert = require("node:assert/strict");

const cartModelPath = "../models/cartModel";
const holdModelPath = "../models/inventoryHoldModel";
const availabilityPath = "../utils/productAvailability";

let originals = {};

const mockFindChain = (value) => ({
  select: () => ({
    lean: async () => value,
  }),
});

test.beforeEach(() => {
  delete require.cache[require.resolve(cartModelPath)];
  delete require.cache[require.resolve(holdModelPath)];
  delete require.cache[require.resolve(availabilityPath)];

  const Cart = require(cartModelPath);
  const InventoryHold = require(holdModelPath);

  originals = {
    cartFind: Cart.find,
    holdFind: InventoryHold.find,
  };

  Cart.find = () => mockFindChain([]);
  InventoryHold.find = () => mockFindChain([]);
});

test.afterEach(() => {
  const Cart = require(cartModelPath);
  const InventoryHold = require(holdModelPath);

  Cart.find = originals.cartFind;
  InventoryHold.find = originals.holdFind;

  delete require.cache[require.resolve(availabilityPath)];
});

test("applyEffectiveAvailability subtracts active cart+hold quantities to prevent oversell", async () => {
  const Cart = require(cartModelPath);
  const InventoryHold = require(holdModelPath);

  Cart.find = () =>
    mockFindChain([
      {
        items: [
          {
            listingId: "listing-1",
            variantId: "variant-a",
            quantity: 2,
          },
        ],
      },
    ]);

  InventoryHold.find = () =>
    mockFindChain([
      {
        items: [
          {
            listingId: "listing-1",
            variantId: "variant-a",
            quantity: 3,
          },
        ],
      },
    ]);

  const { applyEffectiveAvailability, resolveLineAvailableQuantity } = require(availabilityPath);

  const products = [
    {
      id: "listing-1",
      listingId: "listing-1",
      availableQuantity: 10,
      variants: [
        {
          id: "variant-a",
          variantId: "variant-a",
          availableQuantity: 6,
        },
      ],
    },
  ];

  const projected = await applyEffectiveAvailability(products, { useCache: false });

  assert.equal(projected[0].availableQuantity, 5);
  assert.equal(projected[0].variants[0].availableQuantity, 1);

  const availableForLine = resolveLineAvailableQuantity(projected, {
    listingId: "listing-1",
    variantId: "variant-a",
  });

  assert.equal(availableForLine, 1);
});
