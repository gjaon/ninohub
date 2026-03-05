const parseAdminEmailAllowlist = () =>
  (process.env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((email) => String(email || "").trim().toLowerCase())
    .filter(Boolean);

const isAdminEmail = (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const allowlist = parseAdminEmailAllowlist();
  if (!allowlist.length) {
    return false;
  }

  return allowlist.includes(normalizedEmail);
};

module.exports = {
  parseAdminEmailAllowlist,
  isAdminEmail,
};
