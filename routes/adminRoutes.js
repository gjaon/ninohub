const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const { requireFlag } = require("../middleware/featureFlags");
const {
  getFallbackQueue,
  getFallbackById,
  markFallbackReviewed,
  addFallbackNote,
  retryFallbackSubmission,
  markFallbackResolved,
  listUsers,
  listWaitlistAdmin,
  updateWaitlistAdminStatus,
  sendCampaign,
  listCampaignDeliveryLogs,
} = require("../controllers/adminController");

router.use(requireFlag("adminModuleEnabled"), protect, requireAdmin);

router.get("/users", listUsers);
router.get("/waitlist", listWaitlistAdmin);
router.patch("/waitlist/:id/status", updateWaitlistAdminStatus);

router.get("/fallbacks", requireFlag("checkoutFallbackEnabled"), getFallbackQueue);
router.get("/fallbacks/:fallbackId", requireFlag("checkoutFallbackEnabled"), getFallbackById);
router.post("/fallbacks/:fallbackId/review", requireFlag("checkoutFallbackEnabled"), markFallbackReviewed);
router.post("/fallbacks/:fallbackId/notes", requireFlag("checkoutFallbackEnabled"), addFallbackNote);
router.post("/fallbacks/:fallbackId/retry", requireFlag("checkoutFallbackEnabled"), retryFallbackSubmission);
router.post("/fallbacks/:fallbackId/resolve", requireFlag("checkoutFallbackEnabled"), markFallbackResolved);

router.post("/campaigns/send", requireFlag("adminMessagingEnabled"), sendCampaign);
router.get("/campaigns/delivery-logs", requireFlag("adminMessagingEnabled"), listCampaignDeliveryLogs);

module.exports = router;
