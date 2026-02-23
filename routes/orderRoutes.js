const express = require("express");
const router = express.Router();
const {
  createOrder,
  initializePayment,
  verifyPaymentAndCreateOrder,
  getOrder,
  getUserOrders,
  trackOrderByNumber,
  updateOrderStatus,
  cancelOrder,
} = require("../controllers/orderController");
const protect = require("../middleware/authMiddleware");

// Route to initialize payment with PayStack
router.post("/initialize-payment", protect, initializePayment);

// Route to create order without payment (mock checkout)
router.post("/create", protect, createOrder);

// Route to verify payment and create order
router.post("/verify-payment", protect, verifyPaymentAndCreateOrder);

// Route to get specific order
router.post("/get/:orderId", protect, getOrder);

// Route to get all orders for user
router.post("/user-orders", protect, getUserOrders);

// Route to track order by number (public with email or auth)
router.post("/track", trackOrderByNumber);

// Route to update order status (admin)
router.put("/update-status/:orderId", protect, updateOrderStatus);

// Route to cancel order
router.post("/cancel/:orderId", protect, cancelOrder);

module.exports = router;
