const Product = require("../models/productModel");
const Cart = require("../models/cartModel");

const CART_EXPIRY_MINUTES = 5;
const CHECKOUT_EXPIRY_MINUTES = 3;

/**
 * Reserve products in cart
 * Restarts the countdown timer when items are added
 */
const reserveCartItems = async (cart) => {
  const expiryTime = new Date(Date.now() + CART_EXPIRY_MINUTES * 60 * 1000);
  
  for (const item of cart.items) {
    let product = await Product.findOne({ productId: item.productId });
    
    if (!product) {
      // Initialize product inventory if it doesn't exist
      product = await Product.create({
        productId: item.productId,
        totalStock: 100, // Default stock
        availableStock: 100,
        reservedStock: 0,
        reservations: [],
      });
    }

    try {
      await product.reserveQuantity(
        cart._id,
        cart.userId,
        cart.sessionId,
        item.quantity,
        CART_EXPIRY_MINUTES
      );
    } catch (error) {
      throw new Error(`Cannot reserve ${item.productName}: ${error.message}`);
    }
  }

  // Update cart reservation expiry
  cart.reservationExpiry = expiryTime;
  cart.reservationStatus = "active";
  await cart.save();

  return cart;
};

/**
 * Release all reserved items for a cart
 */
const releaseCartReservations = async (cartId) => {
  const cart = await Cart.findById(cartId);
  if (!cart) return;

  for (const item of cart.items) {
    const product = await Product.findOne({ productId: item.productId });
    if (product) {
      await product.releaseReservation(cartId);
    }
  }

  cart.reservationStatus = "expired";
  await cart.save();
};

/**
 * Move cart to checkout status (3-minute timer)
 */
const startCheckout = async (cartId) => {
  const cart = await Cart.findById(cartId);
  if (!cart) throw new Error("Cart not found");

  const checkoutExpiry = new Date(Date.now() + CHECKOUT_EXPIRY_MINUTES * 60 * 1000);

  for (const item of cart.items) {
    const product = await Product.findOne({ productId: item.productId });
    if (product) {
      await product.updateReservationStatus(cartId, "checkout");
    }
  }

  cart.reservationStatus = "checkout";
  cart.checkoutStartedAt = new Date();
  cart.reservationExpiry = checkoutExpiry;
  await cart.save();

  return cart;
};

/**
 * Complete cart (mark as completed, release reservations)
 */
const completeCart = async (cartId) => {
  const cart = await Cart.findById(cartId);
  if (!cart) return;

  for (const item of cart.items) {
    const product = await Product.findOne({ productId: item.productId });
    if (product) {
      await product.updateReservationStatus(cartId, "completed");
      // Deduct from total stock
      product.totalStock -= item.quantity;
      product.reservedStock -= item.quantity;
      product.availableStock = product.totalStock - product.reservedStock;
      await product.save();
    }
  }

  cart.reservationStatus = "completed";
  await cart.save();
};

/**
 * Get remaining time for cart reservation
 */
const getRemainingTime = (cart) => {
  if (!cart.reservationExpiry) return 0;
  
  const now = new Date();
  const expiry = new Date(cart.reservationExpiry);
  const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
  
  return remaining;
};

/**
 * Check and clean up expired reservations
 * Returns array of expired cart IDs
 */
const cleanupExpiredReservations = async (io) => {
  const expiredReservations = await Product.cleanupExpiredReservations();
  const expiredCartIds = [...new Set(expiredReservations.map(r => r.cartId.toString()))];
  
  for (const cartId of expiredCartIds) {
    const cart = await Cart.findById(cartId);
    if (cart && cart.reservationStatus !== "completed") {
      cart.reservationStatus = "expired";
      await cart.save();
      
      // Notify client via socket
      if (io) {
        const socketId = cart.userId || cart.sessionId;
        io.emit("cart:reservation:expired", { cartId: cart._id.toString() });
      }
    }
  }
  
  return expiredCartIds;
};

/**
 * Get available stock for a product
 */
const getAvailableStock = async (productId) => {
  const product = await Product.findOne({ productId });
  if (!product) {
    return 100; // Default stock if product not yet tracked
  }
  return product.getAvailableQuantity();
};

module.exports = {
  reserveCartItems,
  releaseCartReservations,
  startCheckout,
  completeCart,
  getRemainingTime,
  cleanupExpiredReservations,
  getAvailableStock,
  CART_EXPIRY_MINUTES,
  CHECKOUT_EXPIRY_MINUTES,
};
