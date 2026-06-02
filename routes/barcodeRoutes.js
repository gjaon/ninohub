const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/adminMiddleware");
const {
  createBarcode,
  updateBarcode,
  getBarcode,
  listBarcodes,
  deleteBarcode,
} = require("../controllers/barcodeController");

router.get("/", protect, requireAdmin, listBarcodes);
router.post("/", protect, requireAdmin, createBarcode);
router.get("/:slug", getBarcode);
router.put("/:slug", protect, requireAdmin, updateBarcode);
router.delete("/:slug", protect, requireAdmin, deleteBarcode);

module.exports = router;
