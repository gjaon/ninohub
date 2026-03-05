const renderTemplate = (template, variables = {}) => {
  const safeTemplate = String(template || "");

  return safeTemplate.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    const value = variables[key];
    return value === undefined || value === null ? "" : String(value);
  });
};

const buildRecipientVariables = (recipient = {}) => {
  const name = String(recipient.name || "").trim();
  const firstName = name ? name.split(/\s+/)[0] : "";

  return {
    name,
    firstName,
    phone: recipient.phone || "",
    email: recipient.email || "",
  };
};

module.exports = {
  renderTemplate,
  buildRecipientVariables,
};
