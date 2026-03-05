const asyncHandler = require("express-async-handler");
const { isAdminEmail } = require("../utils/adminAccess");

const requireAdmin = asyncHandler(async (req, res, next) => {
  const email = req.user?.email;

  if (!isAdminEmail(email)) {
    return res.status(403).json({
      message: "Admin access required",
    });
  }

  return next();
});

module.exports = {
  requireAdmin,
};
