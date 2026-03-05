const test = require("node:test");
const assert = require("node:assert/strict");

const {
  renderTemplate,
  buildRecipientVariables,
} = require("../services/messaging/templateService");

test("renders template variables for name, firstName, phone, email", () => {
  const variables = buildRecipientVariables({
    name: "Ada Lovelace",
    phone: "+2348012345678",
    email: "ada@example.com",
  });

  const rendered = renderTemplate(
    "Hi {{firstName}} ({{name}}), phone={{phone}}, email={{email}}",
    variables
  );

  assert.equal(
    rendered,
    "Hi Ada (Ada Lovelace), phone=+2348012345678, email=ada@example.com"
  );
});
