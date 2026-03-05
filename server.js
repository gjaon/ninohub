const dotenv = require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const {
  emitWaitlistCount,
  startWaitlistChangeStream,
} = require("./utils/waitlistRealtime");
const {
  getMarketplaceConfig,
  shouldUseProviderProducts,
} = require("./config/marketplaceConfig");

const userRoute = require("./routes/userRoutes");
const waitlistRoute = require("./routes/waitlistRoutes");
const cartRoute = require("./routes/cartRoutes");
const orderRoute = require("./routes/orderRoutes");
const productRoute = require("./routes/productRoutes");
const marketplaceRoute = require("./routes/marketplaceRoutes");
const webhookRoute = require("./routes/webhookRoutes");
const adminRoute = require("./routes/adminRoutes");
const errorHandler = require("./middleware/errorMiddleware");
const { subscribe } = require("./services/marketplace/businessEventBus");
const { syncInventoryProjection } = require("./services/marketplace/inventoryProjectionService");
const MarketplaceWebhookDelivery = require("./models/marketplaceWebhookDeliveryModel");
const {
  markProcessing,
  markProcessed,
  markRetryOrExhausted,
} = require("./services/marketplace/webhookDeliveryService");
const { reconcileMarketplaceOrders } = require("./services/marketplace/reconciliationService");
const { recordMetric } = require("./services/marketplace/metricsService");
const {
  evaluateWebhookHealth,
  buildPollingProfile,
} = require("./services/marketplace/adaptivePollingService");
const { createEventDedupeCache } = require("./services/marketplace/eventDedupeCache");

const {
  toMonetaryNumber,
  buildLineKey,
  hasRequiredVariantSelection,
  getLineIdentityFromPayload,
  findCartItemIndex,
  recalculateCartTotals,
  applyVariantSwitch,
} = require("./utils/cartLineUtils");
const {
  applyEffectiveAvailability,
  resolveLineAvailableQuantity,
} = require("./utils/productAvailability");
const app = express();
const httpServer = http.createServer(app);

const marketplaceConfig = getMarketplaceConfig();
const eventDedupeCache = createEventDedupeCache();

// Middlewares
app.use(
  express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  })
);
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
const defaultOrigins = [
  "http://localhost:3001",
  "http://localhost:3000",
  "http://localhost:3005",
  "http://localhost:5173",
  "https://www.ninohub.com",
];
const parseOrigins = (origins) =>
  (origins || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const envOrigins = [
  ...parseOrigins(process.env.CLIENT_ORIGIN),
  ...parseOrigins(process.env.FRONTEND_ORIGIN),
  ...parseOrigins(process.env.FRONTEND_URL),
];
const allowedOrigins = [
  ...new Set([...defaultOrigins, ...envOrigins, ...marketplaceConfig.originAllowlist]),
];
const allowAllOrigins = allowedOrigins.includes("*");
const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.NODE_ENV === "staging";

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowAllOrigins || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});
// app.use(
//   cors({
//     origin: ["http://localhost:3000", "https://inventory-software.onrender.com"],
//     credentials: true,
//   })
// );

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Socket.io setup
const io = new Server(httpServer, {
  cors: corsOptions,
  transports: ["websocket", "polling"],
});

const parseCookieHeader = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

// Socket.io authentication middleware
io.use((socket, next) => {
  const sessionId = socket.handshake.auth.sessionId || uuidv4();
  const authToken = socket.handshake.auth.token;
  const cookieHeader = socket.request.headers.cookie;
  const cookies = parseCookieHeader(cookieHeader);
  const cookieToken = cookies.accessToken;
  const token = authToken || cookieToken;

  if (token) {
    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = verified.id;
      socket.sessionId = sessionId;
    } catch (err) {
      socket.userId = null;
      socket.sessionId = sessionId;
    }
  } else {
    socket.userId = null;
    socket.sessionId = sessionId;
  }

  next();
});

const loadProductsWithEffectiveAvailability = async ({
  excludeCartId = null,
  refreshIfStale = true,
  availabilityUseCache = true,
} = {}) => {
  const {
    __testables: { toFrontendProduct },
  } = require("./controllers/productController");

  if (shouldUseProviderProducts()) {
    const {
      getProjectedProducts,
      syncInventoryProjection,
      syncInventoryProjectionIfStale,
    } = require("./services/marketplace/inventoryProjectionService");

    let projected = await getProjectedProducts();

    if (refreshIfStale && projected.length) {
      syncInventoryProjectionIfStale({
        trigger: "on-demand-socket-products-stale-refresh",
        maxAgeMs: Number(process.env.MARKETPLACE_PRODUCTS_SYNC_MAX_AGE_MS || 30000),
      }).catch((error) => {
        console.warn("[socket:products:sync] stale refresh skipped", error.message);
      });
    }

    if (!projected.length) {
      await syncInventoryProjection({ trigger: "on-demand-socket-products-sync-cold-start" });
      projected = await getProjectedProducts();
    }

    if (!projected.length) {
      return [];
    }

    const normalized = projected.map((item) => toFrontendProduct(item));
    return applyEffectiveAvailability(normalized, {
      excludeCartId,
      useCache: availabilityUseCache,
    });
  }

  const localProducts = require("./data/product");
  const normalizedLocalProducts = localProducts.map((item) => toFrontendProduct(item));
  return applyEffectiveAvailability(normalizedLocalProducts, {
    excludeCartId,
    useCache: availabilityUseCache,
  });
};

const assertCartFitsAvailability = ({ cart, products }) => {
  for (const item of cart.items || []) {
    const requestedQty = Number(item?.quantity || 0);
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      continue;
    }

    const availableQty = resolveLineAvailableQuantity(products, {
      listingId: item?.listingId,
      parentGroupId: item?.parentGroupId,
      productId: item?.productId,
      variantId: item?.variantId,
    });

    if (requestedQty > availableQty) {
      const itemName = item?.productName || "item";
      throw new Error(`Only ${Math.max(0, availableQty)} available for ${itemName}`);
    }
  }
};

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}, sessionId: ${socket.sessionId}`);

  if (socket.userId) {
    socket.join(`buyer:${socket.userId}`);
  }
  socket.join(`session:${socket.sessionId}`);

  emitWaitlistCount(io, socket.id).catch((error) => {
    console.error("waitlist:count initial emit error:", error.message);
  });

  socket.on("waitlist:count:request", async () => {
    try {
      await emitWaitlistCount(io, socket.id);
    } catch (error) {
      console.error("waitlist:count:request error:", error.message);
    }
  });

  // Cart events
  socket.on("cart:add", async (data, ack) => {
    try {
      const Cart = require("./models/cartModel");
      const { reserveCartItems, getRemainingTime } = require("./utils/cartReservation");
      const { product, quantity = 1 } = data;

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      let cart = await Cart.findOne(query);

      if (!cart) {
        const cartData = {
          items: [],
          customizations: [],
          totalItems: 0,
          totalPrice: 0,
        };
        if (socket.userId) cartData.userId = socket.userId;
        else cartData.sessionId = socket.sessionId;

        cart = await Cart.create(cartData);
      }

      const productId = String(product.id);
      const variantId = String(product.variantId || "").trim();
      if (!hasRequiredVariantSelection(product)) {
        socket.emit("cart:error", { message: "Variant selection is required for grouped products" });
        if (typeof ack === "function") {
          ack({ ok: false, message: "Variant selection is required for grouped products" });
        }
        return;
      }
      const lineKey = buildLineKey(productId, variantId);
      const productPrice = toMonetaryNumber(product.price, 0);
      const originalPrice = toMonetaryNumber(product.originalPrice, productPrice);
      const intrinsicDiscountPercent = Number(product.discountPercent || 0);
      const existingItemIndex = findCartItemIndex(cart.items, {
        lineKey,
        productId,
        variantId,
      });
      const existingItem = existingItemIndex >= 0 ? cart.items[existingItemIndex] : null;
      const previousItems = cart.items.map((item) => (item?.toObject ? item.toObject() : { ...item }));
      
      if (existingItem) {
        existingItem.quantity = Number(existingItem.quantity || 0) + Number(quantity || 0);
        existingItem.price = productPrice; // Update price in case it changed
        existingItem.productName = product.name; // Update name
        existingItem.image = product.image; // Update image
        existingItem.selectedImage = product.selectedImage || product.image;
        existingItem.lineKey = lineKey;
        existingItem.listingId = product.listingId || product.parentGroupId || product.id || null;
        existingItem.variantId = variantId || null;
        existingItem.variantName = product.variantName || null;
        existingItem.parentGroupId = product.parentGroupId || null;
        existingItem.groupName = product.groupName || null;
        existingItem.originalPrice = originalPrice;
        existingItem.intrinsicDiscountPercent = Number.isFinite(intrinsicDiscountPercent)
          ? intrinsicDiscountPercent
          : 0;
      } else {
        cart.items.push({
          productId: productId,
          lineKey,
          listingId: product.listingId || product.parentGroupId || product.id || null,
          productName: product.name,
          price: productPrice,
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

      recalculateCartTotals(cart);

      try {
        const productsWithAvailability = await loadProductsWithEffectiveAvailability({
          excludeCartId: cart._id,
          refreshIfStale: false,
          availabilityUseCache: false,
        });
        assertCartFitsAvailability({
          cart,
          products: productsWithAvailability,
        });
      } catch (availabilityError) {
        cart.items = previousItems;
        recalculateCartTotals(cart);
        socket.emit("cart:error", { message: availabilityError.message });
        if (typeof ack === "function") {
          ack({ ok: false, message: availabilityError.message });
        }
        return;
      }

      await cart.save();

      // Reserve items and restart countdown
      try {
        await reserveCartItems(cart);
        const remainingTime = getRemainingTime(cart);
        
        socket.emit("cart:updated", { 
          ...cart.toObject(), 
          remainingTime,
          reservationExpiry: cart.reservationExpiry 
        });
        if (typeof ack === "function") {
          ack({ ok: true });
        }
        socket.broadcast.emit("inventory:updated"); // Notify others about inventory change
      } catch (reservationError) {
        // If reservation fails, remove the item and notify user
        if (!existingItem) {
          cart.items = cart.items.filter((item) => String(item.lineKey || "") !== lineKey);
        } else {
          existingItem.quantity = Number(existingItem.quantity || 0) - Number(quantity || 0);
          if (existingItem.quantity <= 0) {
            cart.items = cart.items.filter((item) => String(item.lineKey || "") !== lineKey);
          }
        }
        recalculateCartTotals(cart);
        await cart.save();
        
        socket.emit("cart:error", { message: reservationError.message });
        if (typeof ack === "function") {
          ack({ ok: false, message: reservationError.message });
        }
        return;
      }
    } catch (error) {
      console.error("cart:add error:", error);
      socket.emit("cart:error", { message: error.message });
      if (typeof ack === "function") {
        ack({ ok: false, message: error.message });
      }
    }
  });

  socket.on("cart:remove", async (data) => {
    try {
      const Cart = require("./models/cartModel");
      const { reserveCartItems, getRemainingTime } = require("./utils/cartReservation");
      const identity = getLineIdentityFromPayload(data);

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);

      if (!cart) return;

      const existingIndex = findCartItemIndex(cart.items, identity);
      if (existingIndex >= 0) {
        cart.items.splice(existingIndex, 1);
      }
      recalculateCartTotals(cart);

      await cart.save();

      // Update reservations
      if (cart.items.length > 0) {
        await reserveCartItems(cart);
        const remainingTime = getRemainingTime(cart);
        socket.emit("cart:updated", { 
          ...cart.toObject(), 
          remainingTime,
          reservationExpiry: cart.reservationExpiry 
        });
      } else {
        // Clear all reservations if cart is empty
        const { releaseCartReservations } = require("./utils/cartReservation");
        await releaseCartReservations(cart._id);
        socket.emit("cart:updated", cart);
      }
      
      socket.broadcast.emit("inventory:updated");
    } catch (error) {
      console.error("cart:remove error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("cart:updateQuantity", async (data) => {
    try {
      const Cart = require("./models/cartModel");
      const { reserveCartItems, getRemainingTime } = require("./utils/cartReservation");
      const identity = getLineIdentityFromPayload(data);
      const quantity = Number(data?.quantity || 0);

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);

      if (!cart) return;

      const previousItems = cart.items.map((item) => (item?.toObject ? item.toObject() : { ...item }));

      if (quantity < 1) {
        const existingIndex = findCartItemIndex(cart.items, identity);
        if (existingIndex >= 0) {
          cart.items.splice(existingIndex, 1);
        }
      } else {
        const existingIndex = findCartItemIndex(cart.items, identity);
        const item = existingIndex >= 0 ? cart.items[existingIndex] : null;
        if (item) item.quantity = quantity;
      }

      recalculateCartTotals(cart);

      try {
        const productsWithAvailability = await loadProductsWithEffectiveAvailability({
          excludeCartId: cart._id,
          refreshIfStale: false,
          availabilityUseCache: false,
        });
        assertCartFitsAvailability({
          cart,
          products: productsWithAvailability,
        });
      } catch (availabilityError) {
        cart.items = previousItems;
        recalculateCartTotals(cart);
        socket.emit("cart:error", { message: availabilityError.message });
        return;
      }

      await cart.save();

      // Update reservations
      if (cart.items.length > 0) {
        await reserveCartItems(cart);
        const remainingTime = getRemainingTime(cart);
        socket.emit("cart:updated", { 
          ...cart.toObject(), 
          remainingTime,
          reservationExpiry: cart.reservationExpiry 
        });
      } else {
        const { releaseCartReservations } = require("./utils/cartReservation");
        await releaseCartReservations(cart._id);
        socket.emit("cart:updated", cart);
      }
      
      socket.broadcast.emit("inventory:updated");
    } catch (error) {
      console.error("cart:updateQuantity error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("cart:updateVariant", async (data) => {
    try {
      const Cart = require("./models/cartModel");
      const { reserveCartItems, getRemainingTime } = require("./utils/cartReservation");

      const currentIdentity = getLineIdentityFromPayload(data?.current || data || {});
      const nextVariantId = String(data?.nextVariantId || data?.variantId || "").trim();
      const nextVariantName = String(data?.nextVariantName || "").trim() || null;
      const nextPrice = toMonetaryNumber(data?.nextPrice, NaN);
      const nextImage = String(data?.nextImage || "").trim();

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);
      if (!cart) return;

      const previousItems = cart.items.map((item) => (item?.toObject ? item.toObject() : { ...item }));

      const currentIndex = findCartItemIndex(cart.items, currentIdentity);
      if (currentIndex < 0) {
        socket.emit("cart:error", { message: "Cart item not found for variant switch" });
        return;
      }

      applyVariantSwitch({
        items: cart.items,
        currentIdentity,
        nextVariantId,
        nextVariantName,
        nextPrice,
        nextImage,
      });

      recalculateCartTotals(cart);

      try {
        const productsWithAvailability = await loadProductsWithEffectiveAvailability({
          excludeCartId: cart._id,
          refreshIfStale: false,
          availabilityUseCache: false,
        });
        assertCartFitsAvailability({
          cart,
          products: productsWithAvailability,
        });
      } catch (availabilityError) {
        cart.items = previousItems;
        recalculateCartTotals(cart);
        socket.emit("cart:error", { message: availabilityError.message });
        return;
      }

      await cart.save();

      if (cart.items.length > 0) {
        await reserveCartItems(cart);
        const remainingTime = getRemainingTime(cart);
        socket.emit("cart:updated", {
          ...cart.toObject(),
          remainingTime,
          reservationExpiry: cart.reservationExpiry,
        });
      } else {
        socket.emit("cart:updated", cart);
      }

      socket.broadcast.emit("inventory:updated");
    } catch (error) {
      console.error("cart:updateVariant error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("cart:sync", async (data) => {
    try {
      const Cart = require("./models/cartModel");
      const { getRemainingTime } = require("./utils/cartReservation");
      const { sessionId } = data;

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      let cart = await Cart.findOne(query);

      if (!cart) {
        const cartData = {
          items: [],
          customizations: [],
          totalItems: 0,
          totalPrice: 0,
        };
        if (socket.userId) cartData.userId = socket.userId;
        else cartData.sessionId = socket.sessionId;

        cart = await Cart.create(cartData);
      }

      const remainingTime = getRemainingTime(cart);
      socket.emit("cart:synced", { 
        ...cart.toObject(), 
        remainingTime,
        reservationExpiry: cart.reservationExpiry 
      });
    } catch (error) {
      console.error("cart:sync error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  // Get remaining time for cart reservation
  socket.on("cart:getRemainingTime", async () => {
    try {
      const Cart = require("./models/cartModel");
      const { getRemainingTime } = require("./utils/cartReservation");

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);

      if (!cart) {
        socket.emit("cart:remainingTime", { remainingTime: 0 });
        return;
      }

      const remainingTime = getRemainingTime(cart);
      socket.emit("cart:remainingTime", { 
        remainingTime, 
        reservationExpiry: cart.reservationExpiry,
        reservationStatus: cart.reservationStatus 
      });
    } catch (error) {
      console.error("cart:getRemainingTime error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  // Start checkout (switch to 3-minute timer)
  socket.on("cart:startCheckout", async () => {
    try {
      const Cart = require("./models/cartModel");
      const { startCheckout, getRemainingTime } = require("./utils/cartReservation");

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);

      if (!cart) {
        socket.emit("cart:error", { message: "Cart not found" });
        return;
      }

      await startCheckout(cart._id);
      const updatedCart = await Cart.findById(cart._id);
      const remainingTime = getRemainingTime(updatedCart);

      socket.emit("cart:checkoutStarted", { 
        remainingTime,
        reservationExpiry: updatedCart.reservationExpiry,
        reservationStatus: updatedCart.reservationStatus 
      });
    } catch (error) {
      console.error("cart:startCheckout error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  // Cancel checkout (back to cart)
  socket.on("cart:cancelCheckout", async () => {
    try {
      const Cart = require("./models/cartModel");
      const { reserveCartItems, getRemainingTime } = require("./utils/cartReservation");

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);

      if (!cart) return;

      // Reset to 5-minute timer
      await reserveCartItems(cart);
      const updatedCart = await Cart.findById(cart._id);
      const remainingTime = getRemainingTime(updatedCart);

      socket.emit("cart:checkoutCancelled", { 
        remainingTime,
        reservationExpiry: updatedCart.reservationExpiry,
        reservationStatus: updatedCart.reservationStatus 
      });
    } catch (error) {
      console.error("cart:cancelCheckout error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("products:sync", async () => {
    try {
      const productsWithAvailability = await loadProductsWithEffectiveAvailability();
      if (!productsWithAvailability.length) {
        socket.emit("products:error", {
          message: "Provider inventory is unavailable. No projected products found.",
        });
        return;
      }
      socket.emit("products:synced", productsWithAvailability);
    } catch (error) {
      console.error("products:sync error:", error);
      socket.emit("products:error", { message: "Failed to sync products" });
    }
  });

  socket.on("cart:addCustomization", async (data) => {
    try {
      const Cart = require("./models/cartModel");
      const { customization, sessionId } = data;

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      let cart = await Cart.findOne(query);

      if (!cart) {
        const cartData = {
          items: [],
          customizations: [],
          totalItems: 0,
          totalPrice: 0,
        };
        if (socket.userId) cartData.userId = socket.userId;
        else cartData.sessionId = socket.sessionId;

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

      const customizationTotal = cart.customizations.reduce((sum, c) => sum + c.price * c.quantity, 0);
      cart.totalPrice =
        cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + customizationTotal;
      cart.totalItems =
        cart.items.reduce((sum, item) => sum + item.quantity, 0) +
        cart.customizations.reduce((sum, c) => sum + c.quantity, 0);

      await cart.save();

      socket.emit("cart:updated", cart);
      socket.broadcast.emit("cart:updated", cart);
    } catch (error) {
      console.error("cart:addCustomization error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// Store io instance globally for access in route handlers
app.locals.io = io;

subscribe((eventEnvelope) => {
  if (marketplaceConfig.realtimeEventDedupeEnabled && eventEnvelope?.eventId) {
    if (eventDedupeCache.has(eventEnvelope.eventId)) {
      recordMetric("marketplace.realtime.event_deduped", {
        eventType: String(eventEnvelope?.eventType || "unknown"),
      }).catch(() => null);
      return;
    }
    eventDedupeCache.add(eventEnvelope.eventId);
  }

  io.emit("business:event", eventEnvelope);
  if (eventEnvelope.buyerId) {
    io.to(`buyer:${eventEnvelope.buyerId}`).emit("business:event", eventEnvelope);
  }
});

const startAdaptiveReconciliationWorker = ({ io, marketplaceConfig }) => {
  const run = async () => {
    let nextDelayMs = 60000;

    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 10 * 60 * 1000);
      const deliveries = await MarketplaceWebhookDelivery.find({
        provider: "provider",
        createdAt: { $gte: windowStart },
      })
        .select("status createdAt processedAt")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

      const processed = deliveries.filter((delivery) => delivery.status === "processed");
      const retryingCount = deliveries.filter((delivery) => delivery.status === "retrying").length;
      const exhaustedCount = deliveries.filter((delivery) => delivery.status === "exhausted").length;

      const latestProcessedAt = processed[0]?.processedAt || processed[0]?.createdAt || null;
      const latestProcessedAgeMs = latestProcessedAt ? Math.max(0, Date.now() - new Date(latestProcessedAt).getTime()) : Number.MAX_SAFE_INTEGER;

      const avgLagMs = processed.length
        ? Math.round(
            processed.reduce((sum, delivery) => {
              const createdAt = new Date(delivery.createdAt).getTime();
              const processedAt = new Date(delivery.processedAt || delivery.createdAt).getTime();
              return sum + Math.max(0, processedAt - createdAt);
            }, 0) / processed.length
          )
        : Number.MAX_SAFE_INTEGER;

      const health = evaluateWebhookHealth({
        latestProcessedAgeMs,
        retryingCount,
        exhaustedCount,
        avgLagMs,
        degradedLagMsThreshold: marketplaceConfig.adaptivePollingDegradedLagMsThreshold,
        unhealthyLagMsThreshold: marketplaceConfig.adaptivePollingUnhealthyLagMsThreshold,
      });

      const profile = buildPollingProfile({
        health,
        healthyIntervalMs: marketplaceConfig.adaptivePollingHealthyIntervalMs,
        degradedIntervalMs: marketplaceConfig.adaptivePollingDegradedIntervalMs,
        unhealthyIntervalMs: marketplaceConfig.adaptivePollingUnhealthyIntervalMs,
      });

      nextDelayMs = profile.pollIntervalMs;

      await recordMetric("marketplace.polling.activation", {
        fallbackActive: profile.fallbackActive ? "yes" : "no",
        reason: profile.reason,
        health,
      });
      await recordMetric("marketplace.webhook.event_lag_bucket", {
        bucket: avgLagMs >= 180000 ? ">=180s" : avgLagMs >= 60000 ? "60s-179s" : "<60s",
      });

      io.emit("business:event", {
        eventId: uuidv4(),
        eventType: "marketplace.polling.mode.changed",
        occurredAt: new Date().toISOString(),
        source: "marketplace.adaptive-polling",
        correlationId: null,
        payloadVersion: "1.0",
        payload: {
          fallbackActive: profile.fallbackActive,
          reason: profile.reason,
          pollIntervalMs: profile.pollIntervalMs,
          health,
        },
        buyerId: null,
      });

      if (profile.fallbackActive) {
        const result = await reconcileMarketplaceOrders({ limit: 50 });
        if (result.reconciled > 0) {
          console.info("Marketplace adaptive reconciliation corrected orders", result);
        }
      }
    } catch (error) {
      nextDelayMs = marketplaceConfig.adaptivePollingDegradedIntervalMs;
      console.error("Marketplace adaptive reconciliation worker failed:", error.message);
      await recordMetric("marketplace.polling.worker_failed");
    } finally {
      setTimeout(run, Math.max(5000, nextDelayMs));
    }
  };

  run();
};

// Start cleanup interval for expired cart reservations (every 30 seconds)
const { cleanupExpiredReservations } = require("./utils/cartReservation");
setInterval(async () => {
  try {
    await cleanupExpiredReservations(io);
  } catch (error) {
    console.error("Reservation cleanup error:", error);
  }
}, 30000); // Run every 30 seconds

if (marketplaceConfig.internalUiEnabled) {
  setInterval(async () => {
    try {
      await syncInventoryProjection({ trigger: "scheduled-refresh" });
    } catch (error) {
      console.error("Scheduled marketplace sync failed:", error.message);
    }
  }, 10 * 60 * 1000);

  setInterval(async () => {
    try {
      const { releaseExpiredHolds } = require("./services/marketplace/holdService");
      await releaseExpiredHolds();
    } catch (error) {
      console.error("Hold expiry worker failed:", error.message);
    }
  }, 30000);
}

if (marketplaceConfig.webhooksEnabled) {
  if (marketplaceConfig.providerWebhookRegistrationEnabled) {
    setImmediate(async () => {
      try {
        const { ensureProviderWebhookEndpointRegistered } = require("./services/marketplace/webhookRegistrationService");
        await ensureProviderWebhookEndpointRegistered();
      } catch (error) {
        console.error("Provider webhook registration failed:", error.message);
      }
    });

    setInterval(async () => {
      try {
        const { ensureProviderWebhookEndpointRegistered } = require("./services/marketplace/webhookRegistrationService");
        await ensureProviderWebhookEndpointRegistered();
      } catch (error) {
        console.error("Provider webhook registration refresh failed:", error.message);
      }
    }, 6 * 60 * 60 * 1000);
  }

  setInterval(async () => {
    try {
      const {
        processPaystackDelivery,
        processProviderDelivery,
      } = require("./controllers/webhookController");

      const now = new Date();
      const pending = await MarketplaceWebhookDelivery.find({
        status: "retrying",
        nextAttemptAt: { $lte: now },
      })
        .sort({ nextAttemptAt: 1 })
        .limit(20);

      for (const delivery of pending) {
        try {
          await markProcessing(delivery.deliveryId);

          if (delivery.provider === "paystack") {
            await processPaystackDelivery(delivery);
          }

          if (delivery.provider === "provider") {
            await processProviderDelivery(delivery);
          }

          await markProcessed(delivery.deliveryId);
        } catch (error) {
          await markRetryOrExhausted({
            deliveryId: delivery.deliveryId,
            errorMessage: error.message,
          });
        }
      }
    } catch (error) {
      console.error("Webhook retry worker failed:", error.message);
    }
  }, 15000);

  if (marketplaceConfig.adaptivePollingEnabled) {
    startAdaptiveReconciliationWorker({ io, marketplaceConfig });
  } else {
    setInterval(async () => {
      try {
        const result = await reconcileMarketplaceOrders({ limit: 50 });
        if (result.reconciled > 0) {
          console.info("Marketplace reconciliation corrected orders", result);
        }
      } catch (error) {
        console.error("Marketplace reconciliation worker failed:", error.message);
      }
    }, 60000);
  }
}

// Routes Middleware
app.use("/api/users", userRoute);
app.use("/api/waitlist", waitlistRoute);
app.use("/api/cart", cartRoute);
app.use("/api/orders", orderRoute);
app.use("/api/products", productRoute);
app.use("/api/marketplace", marketplaceRoute);
app.use("/api/webhooks", webhookRoute);
app.use("/api/admin", adminRoute);

// Routes
app.get("/api", (req, res) => {
  res.send("API is running..");
});

// --------------------------deployment on heroku------------------------------

// Serve static assets in production
if (
  process.env.NODE_ENV === "production" ||
  process.env.NODE_ENV === "staging"
) {
  app.use(express.static(path.join(__dirname, "/client/build")));

  // Serve React app for all non-API routes using a catch-all
  app.use((req, res) => {
    res.sendFile(path.join(__dirname, "/client/build", "index.html"));
  });
}

// --------------------------deployment------------------------------

// Error Middleware
app.use(errorHandler);

// Connect to DB and start server
const PORT = process.env.PORT || 5001;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    const waitlistChangeStream = startWaitlistChangeStream(io);
    app.locals.waitlistChangeStream = waitlistChangeStream;

    httpServer.listen(PORT, () => {
      console.log(`Server Running on port ${PORT}`);
    });
  })
  .catch((err) => console.log(err));