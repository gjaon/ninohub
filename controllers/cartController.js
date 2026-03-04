const Cart = require("../models/cartModel");
const asyncHandler = require("express-async-handler");

const buildLineKey = (productId, variantId = "") => `${String(productId || "").trim()}::${String(variantId || "").trim()}`;

const findItemIndex = (items = [], { lineKey, productId, variantId }) => {
  if (lineKey) {
    const byLineKey = items.findIndex((item) => String(item?.lineKey || "") === String(lineKey));
    if (byLineKey >= 0) return byLineKey;
  }

  const normalizedProductId = String(productId || "").trim();
  const normalizedVariantId = String(variantId || "").trim();

  const exactMatch = items.findIndex(
    (item) =>
      String(item?.productId || "") === normalizedProductId
      && String(item?.variantId || "") === normalizedVariantId
  );

  if (exactMatch >= 0) return exactMatch;

  if (!normalizedVariantId) {
    return items.findIndex((item) => String(item?.productId || "") === normalizedProductId);
  }

  return -1;
};

const recalcTotals = (cart) => {
  cart.totalItems = cart.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  cart.totalPrice = cart.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
};

// Get cart by userId or sessionId
const getCart = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  let cart;

  if (req.user) {
    cart = await Cart.findOne({ userId: req.user.id });
  } else if (sessionId) {
    cart = await Cart.findOne({ sessionId });
  } else {
    return res.status(400).json({ message: "User ID or Session ID required" });
  }

  if (!cart) {
    return res.status(404).json({ message: "Cart not found" });
  }

  res.status(200).json(cart);
});

// Initialize or get cart (create if doesn't exist)
const initializeCart = asyncHandler(async (req, res) => {
  const { sessionId } = req.body;
  let cart;
  const query = req.user ? { userId: req.user.id } : { sessionId };

  cart = await Cart.findOne(query);

  if (!cart) {
    const cartData = {
      items: [],
      customizations: [],
      totalItems: 0,
      totalPrice: 0,
    };

    if (req.user) {
      cartData.userId = req.user.id;
    } else {
      cartData.sessionId = sessionId;
    }

    cart = await Cart.create(cartData);
  }

  res.status(200).json(cart);
});

// Add item to cart
const addToCart = asyncHandler(async (req, res, io, socket) => {
  const { product, sessionId, quantity = 1 } = req.body;
  const productId = String(product?.id || product?.productId || "").trim();
  const variantId = String(product?.variantId || "").trim();
  const lineKey = buildLineKey(productId, variantId);
  const originalPrice = Number(product?.originalPrice || product?.price || 0);
  const intrinsicDiscountPercent = Number(product?.discountPercent || 0);

  let cart;
  const query = socket?.userId ? { userId: socket.userId } : { sessionId };

  cart = await Cart.findOne(query);

  if (!cart) {
    const cartData = {
      items: [],
      customizations: [],
      totalItems: 0,
      totalPrice: 0,
    };

    if (socket?.userId) {
      cartData.userId = socket.userId;
    } else {
      cartData.sessionId = sessionId;
    }

    cart = await Cart.create(cartData);
  }

  // Check if item already exists
  const existingItemIndex = findItemIndex(cart.items, {
    lineKey,
    productId,
    variantId,
  });
  const existingItem = existingItemIndex >= 0 ? cart.items[existingItemIndex] : null;

  if (existingItem) {
    existingItem.quantity += quantity;
    existingItem.originalPrice = originalPrice;
    existingItem.intrinsicDiscountPercent = Number.isFinite(intrinsicDiscountPercent)
      ? intrinsicDiscountPercent
      : 0;
  } else {
    cart.items.push({
      productId,
      lineKey,
      listingId: product?.listingId || product?.parentGroupId || productId,
      productName: product.name,
      price: product.price,
      quantity,
      image: product.image,
      selectedImage: product.selectedImage || product.image,
      variantId: variantId || null,
      variantName: product.variantName || null,
      parentGroupId: product.parentGroupId || null,
      groupName: product.groupName || null,
      originalPrice,
      intrinsicDiscountPercent: Number.isFinite(intrinsicDiscountPercent)
        ? intrinsicDiscountPercent
        : 0,
    });
  }

  recalcTotals(cart);

  await cart.save();

  // Emit update to frontend
  if (socket) {
    socket.emit("cart:updated", cart);
    socket.broadcast.emit("cart:updated", cart);
  }

  return cart;
});

// Remove item from cart
const removeFromCart = asyncHandler(async (req, res, io, socket) => {
  const { productId, variantId, lineKey, sessionId } = req.body;

  const query = socket?.userId ? { userId: socket.userId } : { sessionId };
  let cart = await Cart.findOne(query);

  if (!cart) {
    return null;
  }

  const itemIndex = findItemIndex(cart.items, { lineKey, productId, variantId });
  if (itemIndex >= 0) {
    cart.items.splice(itemIndex, 1);
  }

  recalcTotals(cart);

  await cart.save();

  if (socket) {
    socket.emit("cart:updated", cart);
    socket.broadcast.emit("cart:updated", cart);
  }

  return cart;
});

// Update item quantity
const updateQuantity = asyncHandler(async (req, res, io, socket) => {
  const { productId, variantId, lineKey, quantity, sessionId } = req.body;

  if (quantity < 1) {
    return removeFromCart({ body: { productId, variantId, lineKey, sessionId } }, res, io, socket);
  }

  const query = socket?.userId ? { userId: socket.userId } : { sessionId };
  let cart = await Cart.findOne(query);

  if (!cart) {
    return null;
  }

  const itemIndex = findItemIndex(cart.items, { lineKey, productId, variantId });
  const item = itemIndex >= 0 ? cart.items[itemIndex] : null;
  if (item) {
    item.quantity = quantity;
  }

  recalcTotals(cart);

  await cart.save();

  if (socket) {
    socket.emit("cart:updated", cart);
    socket.broadcast.emit("cart:updated", cart);
  }

  return cart;
});

// Clear cart
const clearCart = asyncHandler(async (req, res, io, socket) => {
  const { sessionId } = req.body;

  const query = socket?.userId ? { userId: socket.userId } : { sessionId };
  let cart = await Cart.findOne(query);

  if (!cart) {
    return null;
  }

  cart.items = [];
  cart.customizations = [];
  cart.totalItems = 0;
  cart.totalPrice = 0;

  await cart.save();

  if (socket) {
    socket.emit("cart:updated", cart);
  }

  return cart;
});

// Add customization to cart
const addCustomization = asyncHandler(async (req, res, io, socket) => {
  const { customization, sessionId } = req.body;

  const query = socket?.userId ? { userId: socket.userId } : { sessionId };
  let cart = await Cart.findOne(query);

  if (!cart) {
    const cartData = {
      items: [],
      customizations: [],
      totalItems: 0,
      totalPrice: 0,
    };

    if (socket?.userId) {
      cartData.userId = socket.userId;
    } else {
      cartData.sessionId = sessionId;
    }

    cart = await Cart.create(cartData);
  }

  cart.customizations.push({
    customizationId: customization.id,
    productId: customization.productId,
    name: customization.name,
    details: customization.details,
    price: customization.price,
    quantity: customization.quantity || 1,
  });

  // Recalculate totals
  const customizationTotal = cart.customizations.reduce(
    (sum, c) => sum + c.price * c.quantity,
    0
  );
  cart.totalPrice =
    cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0) +
    customizationTotal;
  cart.totalItems =
    cart.items.reduce((sum, item) => sum + item.quantity, 0) +
    cart.customizations.reduce((sum, c) => sum + c.quantity, 0);

  await cart.save();

  if (socket) {
    socket.emit("cart:updated", cart);
    socket.broadcast.emit("cart:updated", cart);
  }

  return cart;
});

// Migrate session cart to user cart on login
const migrateSessionCart = asyncHandler(async (userId, sessionId) => {
  if (!sessionId) return;

  const sessionCart = await Cart.findOne({ sessionId });
  if (!sessionCart || sessionCart.items.length === 0) return;

  let userCart = await Cart.findOne({ userId });

  if (!userCart) {
    // No user cart exists, convert session cart to user cart
    sessionCart.userId = userId;
    sessionCart.sessionId = null;
    await sessionCart.save();
  } else {
    // Merge session cart into user cart
    sessionCart.items.forEach((sessionItem) => {
      const existingItemIndex = findItemIndex(userCart.items, {
        lineKey: sessionItem.lineKey || buildLineKey(sessionItem.productId, sessionItem.variantId),
        productId: sessionItem.productId,
        variantId: sessionItem.variantId,
      });
      const existingItem = existingItemIndex >= 0 ? userCart.items[existingItemIndex] : null;
      if (existingItem) {
        existingItem.quantity += sessionItem.quantity;
      } else {
        userCart.items.push(sessionItem);
      }
    });

    // Merge customizations
    sessionCart.customizations.forEach((customization) => {
      userCart.customizations.push(customization);
    });

    recalcTotals(userCart);

    await userCart.save();
    // Delete the session cart
    await Cart.deleteOne({ sessionId });
  }
});

module.exports = {
  getCart,
  initializeCart,
  addToCart,
  removeFromCart,
  updateQuantity,
  clearCart,
  addCustomization,
  migrateSessionCart,
};
