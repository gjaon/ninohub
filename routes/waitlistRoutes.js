const express = require("express");
const router = express.Router();
const {
  joinWaitlist,
  getWaitlist,
  getWaitlistCount,
  updateWaitlistStatus,
} = require("../controllers/waitlistController");

router.post("/join", joinWaitlist);
router.get("/count", getWaitlistCount);
router.get("/", getWaitlist);
router.patch("/:id/status", updateWaitlistStatus);

module.exports = router;
