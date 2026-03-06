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
  generateWaitlistCoupons,
  generateUserCoupons,
  listCoupons,
  revokeCoupon,
  sendCouponSms,
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

router.post("/coupons/generate/waitlist", requireFlag("adminMessagingEnabled"), generateWaitlistCoupons);
router.post("/coupons/generate/users", requireFlag("adminMessagingEnabled"), generateUserCoupons);
router.get("/coupons", requireFlag("adminMessagingEnabled"), listCoupons);
router.post("/coupons/:code/revoke", requireFlag("adminMessagingEnabled"), revokeCoupon);
router.post("/coupons/send-sms", requireFlag("adminMessagingEnabled"), sendCouponSms);

module.exports = router;
