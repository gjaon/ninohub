const test = require("node:test");
const assert = require("node:assert/strict");

const {
  __testables: { toReadableFallbackSections },
} = require("../controllers/adminController");

test("fallback readable formatter returns human-friendly sections", () => {
  const formatted = toReadableFallbackSections({
    buyer: {
      name: "Ada",
      email: "ada@example.com",
      phone: "+2348011111111",
      id: "buyer-1",
    },
    paymentReference: "ref-123",
    payment: {
      status: "failed",
      amount: 12000,
      verifiedAt: new Date("2026-03-06T10:00:00.000Z"),
    },
    lineItems: [
      {
        productName: "Bracelet",
        quantity: 1,
        unitPrice: 12000,
      },
    ],
    providerError: {
      message: "Provider timeout",
      statusCode: 504,
    },
    retryMeta: {
      count: 2,
    },
    history: [
      {
        action: "marked_reviewed",
        actorEmail: "admin@example.com",
        occurredAt: new Date("2026-03-06T10:01:00.000Z"),
      },
    ],
    adminNotes: [
      {
        note: "Customer informed",
        actorEmail: "admin@example.com",
        createdAt: new Date("2026-03-06T10:02:00.000Z"),
      },
    ],
  });

  assert.ok(formatted.buyerInfo);
  assert.ok(formatted.paymentInfo);
  assert.ok(formatted.itemsSummary);
  assert.ok(formatted.errorSummary);
  assert.ok(Array.isArray(formatted.timeline));
  assert.ok(Array.isArray(formatted.adminNotes));
  assert.equal(typeof formatted, "object");
  assert.equal(typeof formatted.raw, "undefined");
});
