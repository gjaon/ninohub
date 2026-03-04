const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __testables: projectionTestables,
} = require("../services/marketplace/inventoryProjectionService");
const {
  __testables: providerClientTestables,
} = require("../services/marketplace/providerClient");
const {
  __testables: marketplaceControllerTestables,
} = require("../controllers/marketplaceController");
const {
  buildLineKey,
  findCartItemIndex,
  applyVariantSwitch,
  hasRequiredVariantSelection,
} = require("../utils/cartLineUtils");
const MarketplaceProductCache = require("../models/marketplaceProductCacheModel");

test("group listings are not duplicated from legacy group-variant projection rows", () => {
  const rows = [
    {
      providerProductId: "variant-a",
      name: "Group A - Red",
      category: "Rings",
      description: "desc",
      image: "red.jpg",
      price: 100,
      currency: "NGN",
      availableQuantity: 2,
      metadata: {
        listingType: "group-variant",
        groupId: "group-a",
        groupName: "Group A",
        name: "Red",
      },
    },
    {
      providerProductId: "variant-b",
      name: "Group A - Blue",
      category: "Rings",
      description: "desc",
      image: "blue.jpg",
      price: 120,
      currency: "NGN",
      availableQuantity: 3,
      metadata: {
        listingType: "group-variant",
        groupId: "group-a",
        groupName: "Group A",
        name: "Blue",
      },
    },
  ];

  const consolidated = projectionTestables.consolidateProjectedRows(rows);
  assert.equal(consolidated.length, 1);
  assert.equal(consolidated[0].providerProductId, "group-a");
  assert.equal(consolidated[0].metadata.listingType, "group");
  assert.equal(consolidated[0].metadata.variants.length, 2);
});

test("grouped checkout lines include listingId + variantId", () => {
  const lines = providerClientTestables.normalizeProviderOrderLines([
    {
      lineId: "line_1",
      productId: "group-a",
      listingId: "group-a",
      variantId: "variant-a",
      quantity: 2,
    },
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].listingId, "group-a");
  assert.equal(lines[0].variantId, "variant-a");
  assert.equal(lines[0].productId, "");
});

test("legacy checkout line with only productId remains valid", () => {
  const lines = providerClientTestables.normalizeProviderOrderLines([
    {
      productId: "legacy-product-id",
      quantity: 1,
    },
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].productId, "legacy-product-id");
  assert.equal(lines[0].listingId, "");
  assert.equal(lines[0].variantId, "");
});

test("delivery provider payload includes shippingAddress and delivery fulfillment", () => {
  const shippingAddress = {
    fulfillmentMethod: "delivery",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+2348012345678",
    street: "12 Allen Ave",
    city: "Ikeja",
    state: "Lagos",
    country: "Nigeria",
    notes: "Call before delivery",
  };

  const payload = providerClientTestables.buildCreateProviderOrderPayload({
    partnerOrderRef: "hold-001",
    buyerId: "buyer-001",
    buyerEmail: "ada@example.com",
    lines: [
      {
        lineId: "line_1",
        listingId: "group-a",
        variantId: "variant-a",
        quantity: 1,
      },
    ],
    shippingAddress,
  });

  assert.equal(payload.partnerOrderRef, "hold-001");
  assert.equal(payload.shippingAddress?.city, "Ikeja");
  assert.equal(payload.fulfillment?.method, "delivery");
  assert.equal(payload.fulfillment?.deliveryNotes, "Call before delivery");
});

test("pickup provider payload includes pickup fulfillment metadata", () => {
  const shippingAddress = {
    fulfillmentMethod: "pickup",
    pickupLocation: "Nino's store, Lafe Junction, Akure",
    fullName: "Buyer Pickup",
  };

  const payload = providerClientTestables.buildCreateProviderOrderPayload({
    partnerOrderRef: "hold-002",
    buyerId: "buyer-002",
    lines: [
      {
        lineId: "line_1",
        productId: "legacy-product-id",
        quantity: 1,
      },
    ],
    shippingAddress,
  });

  assert.equal(payload.fulfillment?.method, "pickup");
  assert.equal(payload.fulfillment?.pickupLocation, "Nino's store, Lafe Junction, Akure");
  assert.equal(payload.customer?.address, "");
});

test("grouped variant line metadata includes line identity and image context", () => {
  const payload = providerClientTestables.buildCreateProviderOrderPayload({
    partnerOrderRef: "hold-003",
    buyerId: "buyer-003",
    lines: [
      {
        lineId: "line_1",
        listingId: "group-a",
        variantId: "variant-a",
        quantity: 2,
      },
    ],
    lineMetadata: [
      {
        lineId: "line_1",
        listingId: "group-a",
        variantId: "variant-a",
        image: "base.jpg",
        selectedImage: "selected.jpg",
        variantName: "Ruby",
        groupName: "Birthstone Ring",
      },
    ],
  });

  assert.equal(payload.lines.length, 1);
  assert.equal(payload.lines[0].productId, "");
  assert.equal(payload.lines[0].listingId, "group-a");
  assert.equal(payload.lines[0].variantId, "variant-a");
  assert.equal(payload.lines[0].selectedImage, "selected.jpg");
  assert.equal(payload.lines[0].variantImage, "selected.jpg");
  assert.equal(payload.lines[0].groupImage, "base.jpg");
  assert.equal(payload.lineMeta.length, 1);
  assert.equal(payload.lineMeta[0].lineId, "line_1");
  assert.equal(payload.lineMeta[0].listingId, "group-a");
  assert.equal(payload.lineMeta[0].variantId, "variant-a");
  assert.equal(payload.lineMeta[0].selectedImage, "selected.jpg");
  assert.equal(payload.lineMeta[0].variantName, "Ruby");
});

test("single-product lines receive image context from hold metadata", () => {
  const payload = providerClientTestables.buildCreateProviderOrderPayload({
    partnerOrderRef: "hold-004",
    buyerId: "buyer-004",
    lines: [
      {
        lineId: "line_1",
        productId: "product-a",
        quantity: 1,
      },
    ],
    lineMetadata: [
      {
        productId: "product-a",
        image: "product-base.jpg",
        selectedImage: "product-selected.jpg",
      },
    ],
  });

  assert.equal(payload.lines.length, 1);
  assert.equal(payload.lines[0].productId, "product-a");
  assert.equal(payload.lines[0].selectedImage, "product-selected.jpg");
  assert.equal(payload.lines[0].variantImage, "product-selected.jpg");
  assert.equal(payload.lines[0].groupImage, "product-base.jpg");
});

test("legacy minimal provider payload remains valid without additive metadata", () => {
  const payload = providerClientTestables.buildCreateProviderOrderPayload({
    partnerOrderRef: "hold-legacy",
    buyerId: "buyer-legacy",
    lines: [
      {
        productId: "legacy-product-id",
        quantity: 1,
      },
    ],
  });

  assert.equal(payload.partnerOrderRef, "hold-legacy");
  assert.equal(payload.lines.length, 1);
  assert.equal(payload.lines[0].productId, "legacy-product-id");
  assert.equal(payload.shippingAddress, undefined);
  assert.equal(payload.fulfillment, undefined);
  assert.equal(payload.lineMeta, undefined);
});

test("grouped variant selection is required before add-to-cart", () => {
  assert.equal(hasRequiredVariantSelection({ listingType: "group", variantId: "" }), false);
  assert.equal(hasRequiredVariantSelection({ listingType: "group", variantId: "variant-a" }), true);
  assert.equal(hasRequiredVariantSelection({ listingType: "single" }), true);
});

test("multiple variants of same group coexist as separate cart lines", () => {
  const items = [
    { productId: "group-a", variantId: "variant-a", lineKey: buildLineKey("group-a", "variant-a") },
    { productId: "group-a", variantId: "variant-b", lineKey: buildLineKey("group-a", "variant-b") },
  ];

  const variantAIndex = findCartItemIndex(items, {
    productId: "group-a",
    variantId: "variant-a",
  });
  const variantBIndex = findCartItemIndex(items, {
    productId: "group-a",
    variantId: "variant-b",
  });

  assert.equal(variantAIndex, 0);
  assert.equal(variantBIndex, 1);
});

test("cart variant switch reprices and preserves quantity", () => {
  const items = [
    {
      productId: "group-a",
      variantId: "variant-a",
      variantName: "Variant A",
      lineKey: buildLineKey("group-a", "variant-a"),
      quantity: 3,
      price: 100,
      image: "a.jpg",
      selectedImage: "a.jpg",
    },
  ];

  const result = applyVariantSwitch({
    items,
    currentIdentity: {
      lineKey: buildLineKey("group-a", "variant-a"),
      productId: "group-a",
      variantId: "variant-a",
    },
    nextVariantId: "variant-b",
    nextVariantName: "Variant B",
    nextPrice: 150,
    nextImage: "b.jpg",
  });

  assert.equal(result.changed, true);
  assert.equal(items.length, 1);
  assert.equal(items[0].variantId, "variant-b");
  assert.equal(items[0].price, 150);
  assert.equal(items[0].quantity, 3);
  assert.equal(items[0].selectedImage, "b.jpg");
  assert.equal(items[0].lineKey, buildLineKey("group-a", "variant-b"));
});

test("legacy grouped hold line resolves to listingId+variantId", async () => {
  const originalFind = MarketplaceProductCache.find;
  MarketplaceProductCache.find = () => ({
    select: () => ({
      lean: async () => [],
    }),
  });

  try {
    const payload = [
      {
        productId: "variant-legacy",
        parentGroupId: "group-legacy",
        quantity: 2,
      },
    ];

    const resolution = await marketplaceControllerTestables.resolveProviderLinesFromHoldItems(payload);
    assert.equal(resolution.unresolved.length, 0);
    assert.equal(resolution.resolvedLines.length, 1);
    assert.equal(resolution.resolvedLines[0].listingId, "group-legacy");
    assert.equal(resolution.resolvedLines[0].variantId, "variant-legacy");
  } finally {
    MarketplaceProductCache.find = originalFind;
  }
});
