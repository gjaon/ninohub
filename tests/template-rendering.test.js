const test = require("node:test");
const assert = require("node:assert/strict");

const {
  renderTemplate,
  buildRecipientVariables,
} = require("../services/messaging/templateService");

test("renders template variables for name, firstName, phone, email and coupon placeholders", () => {
  const variables = buildRecipientVariables({
    name: "Ada Lovelace",
    phone: "+2348012345678",
    email: "ada@example.com",
    couponCode: "WELCOME-2026",
    discountText: "10% off",
    expiryDate: "2026-04-01",
  });

  const rendered = renderTemplate(
    "Hi {{firstName}} ({{name}}), phone={{phone}}, email={{email}}, code={{couponCode}}, discount={{discountText}}, expires={{expiryDate}}",
    variables
  );

  assert.equal(
    rendered,
    "Hi Ada (Ada Lovelace), phone=+2348012345678, email=ada@example.com, code=WELCOME-2026, discount=10% off, expires=2026-04-01"
  );
});
