const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const { requireFlag } = require("../middleware/featureFlags");
const {
  joinWaitlist,
  getWaitlist,
  getWaitlistCount,
  updateWaitlistStatus,
} = require("../controllers/waitlistController");

router.post("/join", joinWaitlist);
router.get("/count", getWaitlistCount);
router.get("/", requireFlag("adminModuleEnabled"), protect, requireAdmin, getWaitlist);
router.patch("/:id/status", requireFlag("adminModuleEnabled"), protect, requireAdmin, updateWaitlistStatus);

module.exports = router;
