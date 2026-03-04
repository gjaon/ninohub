const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { requireFlag, requireAnyFlag } = require("../middleware/featureFlags");
const { requireOriginAllowlist } = require("../middleware/originAllowlist");
const { requirePartnerAuth } = require("../middleware/partnerAuthMiddleware");
const { requireSignedNonce } = require("../middleware/publicSecurityMiddleware");
const {
  createPartnerSession,
  getPublicInventory,
  triggerInventorySync,
  initializeMarketplaceCheckout,
  verifyAndFinalizeMarketplaceCheckout,
  getBuyerMarketplaceOrders,
  trackBuyerMarketplaceOrder,
  getMarketplaceEventSync,
  getMarketplaceMetrics,
  getMarketplaceWebhookRegistrationHealth,
} = require("../controllers/marketplaceController");

router.post(
  "/public/session",
  requireFlag("publicApiEnabled"),
  requireOriginAllowlist,
  createPartnerSession
);

router.get(
  "/public/inventory",
  requireFlag("publicApiEnabled"),
  requireOriginAllowlist,
  requirePartnerAuth,
  requireSignedNonce,
  getPublicInventory
);

router.post(
  "/internal/sync-products",
  requireFlag("internalUiEnabled"),
  protect,
  triggerInventorySync
);

router.post(
  "/checkout/initialize",
  requireAnyFlag(["internalUiEnabled", "publicApiEnabled"]),
  protect,
  initializeMarketplaceCheckout
);

router.post(
  "/checkout/verify",
  requireAnyFlag(["internalUiEnabled", "publicApiEnabled"]),
  verifyAndFinalizeMarketplaceCheckout
);

router.get(
  "/orders",
  requireAnyFlag(["internalUiEnabled", "publicApiEnabled"]),
  protect,
  getBuyerMarketplaceOrders
);

router.post(
  "/orders/track",
  requireAnyFlag(["internalUiEnabled", "publicApiEnabled"]),
  protect,
  trackBuyerMarketplaceOrder
);

router.get(
  "/events/sync",
  requireAnyFlag(["internalUiEnabled", "publicApiEnabled"]),
  protect,
  getMarketplaceEventSync
);

router.get(
  "/internal/metrics",
  requireFlag("internalUiEnabled"),
  protect,
  getMarketplaceMetrics
);

router.get(
  "/internal/webhook-registration-health",
  requireFlag("internalUiEnabled"),
  protect,
  getMarketplaceWebhookRegistrationHealth
);

module.exports = router;
