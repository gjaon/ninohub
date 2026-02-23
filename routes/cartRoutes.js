const express = require("express");
const router = express.Router();
const {
  getCart,
  initializeCart,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  addCustomization,
} = require("../controllers/cartController");
const protect = require("../middleware/authMiddleware");

// Route to initialize/get cart
router.post("/init", protect, initializeCart);

// Route to get cart
router.post("/get", protect, getCart);

// Route to add item to cart
router.post("/add", protect, addToCart);

// Route to remove item from cart
router.post("/remove", protect, removeFromCart);

// Route to update item quantity
router.post("/update-quantity", protect, updateQuantity);

// Route to clear cart
router.post("/clear", protect, clearCart);

// Route to add customization
router.post("/add-customization", protect, addCustomization);

module.exports = router;
