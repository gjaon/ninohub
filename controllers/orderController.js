const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const asyncHandler = require("express-async-handler");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const PAYSTACK_BASE_URL = "https://api.paystack.co";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

const parseCookieHeader = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

// Generate unique order number
const generateOrderNumber = () => {
  return "ORD" + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
};

// Create order without payment (for mock checkout)
const createOrder = asyncHandler(async (req, res) => {
  const { shippingAddress, notes } = req.body;

  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const cart = await Cart.findOne({ userId: req.user.id });

  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  if (!shippingAddress || !shippingAddress.email) {
    return res.status(400).json({ message: "Shipping address required" });
  }

  const orderNumber = generateOrderNumber();
  const order = await Order.create({
    userId: req.user.id,
    orderNumber,
    items: cart.items,
    customizations: cart.customizations,
    totalAmount: cart.totalPrice,
    status: "pending",
    paymentMethod: "paystack",
    shippingAddress,
    notes,
  });

  // Complete cart reservation
  const { completeCart } = require("../utils/cartReservation");
  await completeCart(cart._id);

  cart.items = [];
  cart.customizations = [];
  cart.totalItems = 0;
  cart.totalPrice = 0;
  await cart.save();

  const io = req.app?.locals?.io;
  if (io) {
    io.emit("order:created", {
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status,
    });
  }

  res.status(201).json({
    message: "Order created successfully",
    order,
  });
});

// Initialize PayStack transaction
const initializePayment = asyncHandler(async (req, res) => {
  const { amount, email, sessionId } = req.body;

  if (!amount || !email) {
    return res.status(400).json({ message: "Amount and email required" });
  }

  try {
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        amount: Math.round(amount * 100), // Convert to kobo
        email,
        metadata: {
          userId: req.user?.id || null,
          sessionId,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
      }
    );

    res.status(200).json({
      authorizationUrl: response.data.data.authorization_url,
      accessCode: response.data.data.access_code,
      reference: response.data.data.reference,
    });
  } catch (error) {
    console.error("PayStack initialization error:", error.response?.data || error.message);
    res.status(500).json({
      message: "Failed to initialize payment",
      error: error.response?.data?.message || error.message,
    });
  }
});

// Verify payment and create order
const verifyPaymentAndCreateOrder = asyncHandler(async (req, res, io) => {
  const { reference, shippingAddress, sessionId } = req.body;

  if (!reference) {
    return res.status(400).json({ message: "Payment reference required" });
  }

  try {
    // Verify payment with PayStack
    const verifyResponse = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
        },
      }
    );

    const paymentData = verifyResponse.data.data;

    if (paymentData.status !== "success") {
      return res.status(400).json({
        message: "Payment verification failed",
        status: paymentData.status,
      });
    }

    // Get user's cart
    const query = req.user ? { userId: req.user.id } : { sessionId };
    const cart = await Cart.findOne(query);

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Create order
    const orderNumber = generateOrderNumber();
    const order = await Order.create({
      userId: req.user?.id || null,
      sessionId: sessionId || null,
      orderNumber,
      items: cart.items,
      customizations: cart.customizations,
      totalAmount: paymentData.amount / 100, // Convert back from kobo
      status: "paid",
      paymentMethod: "paystack",
      paymentReference: reference,
      paystackReference: paymentData.reference,
      shippingAddress,
    });

    // Complete cart reservation
    const { completeCart } = require("../utils/cartReservation");
    await completeCart(cart._id);

    // Clear cart
    cart.items = [];
    cart.customizations = [];
    cart.totalItems = 0;
    cart.totalPrice = 0;
    await cart.save();

    // Emit order created event
    const io = req.app?.locals?.io;
    if (io) {
      io.emit("order:created", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        sessionId: order.sessionId,
        status: "paid",
      });
    }

    res.status(201).json({
      message: "Order created successfully",
      order,
      cart,
    });
  } catch (error) {
    console.error("Payment verification error:", error.response?.data || error.message);
    res.status(500).json({
      message: "Payment verification failed",
      error: error.response?.data?.message || error.message,
    });
  }
});

// Get order details
const getOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { sessionId } = req.body;

  const query = { _id: orderId };

  // Ensure user can only access their own orders
  if (req.user) {
    query.userId = req.user.id;
  } else if (sessionId) {
    query.sessionId = sessionId;
  } else {
    return res.status(400).json({ message: "Unauthorized" });
  }

  const order = await Order.findOne(query);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.status(200).json(order);
});

// Get all orders for user
const getUserOrders = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;

  const query = req.user ? { userId: req.user.id } : { sessionId };

  const orders = await Order.find(query).sort({ createdAt: -1 });

  res.status(200).json(orders);
});

// Track order by order number (public with email, or authenticated)
const trackOrderByNumber = asyncHandler(async (req, res) => {
  const { orderNumber, email } = req.body;

  if (!orderNumber) {
    return res.status(400).json({ message: "Order number required" });
  }

  const query = { orderNumber };
  let resolvedUserId = req.user?.id || null;

  if (!resolvedUserId) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies.accessToken;
    if (token) {
      try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        resolvedUserId = verified.id;
      } catch (error) {
        resolvedUserId = null;
      }
    }
  }

  if (resolvedUserId) {
    query.userId = resolvedUserId;
  } else if (email) {
    query["shippingAddress.email"] = email;
  } else {
    return res.status(400).json({ message: "Email required for tracking" });
  }

  const order = await Order.findOne(query);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.status(200).json(order);
});

// Update order status (admin only)
const updateOrderStatus = asyncHandler(async (req, res, io) => {
  const { orderId } = req.params;
  const { status, trackingNumber } = req.body;

  const validStatuses = ["pending", "paid", "processing", "shipped", "delivered", "cancelled"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  order.status = status;
  if (trackingNumber) {
    order.trackingNumber = trackingNumber;
  }

  await order.save();

  // Emit order status update event
  if (io) {
    io.emit("order:statusUpdated", {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      trackingNumber: order.trackingNumber,
      userId: order.userId,
    });
  }

  res.status(200).json(order);
});

// Cancel order
const cancelOrder = asyncHandler(async (req, res, io) => {
  const { orderId } = req.params;
  const { sessionId } = req.body;

  const order = await Order.findById(orderId);

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  // Verify ownership
  if (req.user && order.userId.toString() !== req.user.id) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  if (!req.user && order.sessionId !== sessionId) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  // Can only cancel unpaid or processing orders
  if (!["pending", "processing"].includes(order.status)) {
    return res.status(400).json({
      message: `Cannot cancel ${order.status} order`,
    });
  }

  order.status = "cancelled";
  await order.save();

  // Emit order cancelled event
  if (io) {
    io.emit("order:cancelled", {
      orderId: order._id,
      orderNumber: order.orderNumber,
    });
  }

  res.status(200).json(order);
});

module.exports = {
  createOrder,
  initializePayment,
  verifyPaymentAndCreateOrder,
  getOrder,
  getUserOrders,
  trackOrderByNumber,
  updateOrderStatus,
  cancelOrder,
};
