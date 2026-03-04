const express = require("express");
const router = express.Router();
const { requireFlag } = require("../middleware/featureFlags");
const {
  ingestPaystackWebhook,
  ingestProviderWebhook,
} = require("../controllers/webhookController");

router.post(
  "/paystack",
  requireFlag("webhooksEnabled"),
  ingestPaystackWebhook
);

router.post(
  "/provider",
  requireFlag("webhooksEnabled"),
  ingestProviderWebhook
);

router.post(
  "/marketplace",
  requireFlag("webhooksEnabled"),
  ingestProviderWebhook
);

module.exports = router;
