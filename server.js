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

const userRoute = require("./routes/userRoutes");
const waitlistRoute = require("./routes/waitlistRoutes");
const cartRoute = require("./routes/cartRoutes");
const orderRoute = require("./routes/orderRoutes");
const productRoute = require("./routes/productRoutes");
const errorHandler = require("./middleware/errorMiddleware");

const app = express();
const httpServer = http.createServer(app);

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
const defaultOrigins = ["http://localhost:3000", "http://localhost:3005", "https://www.ninohub.com"];
const envOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.NODE_ENV === "staging";

const corsOptions = isProduction
  ? {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    }
  : {
      origin: true,
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

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}, sessionId: ${socket.sessionId}`);

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
  socket.on("cart:add", async (data) => {
    try {
      const Cart = require("./models/cartModel");
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

      const existingItem = cart.items.find((item) => item.productId === product.id);
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.items.push({
          productId: product.id,
          productName: product.name,
          price: product.price,
          quantity,
          image: product.image,
        });
      }

      cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      await cart.save();

      socket.emit("cart:updated", cart);
      socket.broadcast.emit("cart:updated", cart);
    } catch (error) {
      console.error("cart:add error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("cart:remove", async (data) => {
    try {
      const Cart = require("./models/cartModel");
      const { productId } = data;

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);

      if (!cart) return;

      cart.items = cart.items.filter((item) => item.productId !== productId);
      cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      await cart.save();

      socket.emit("cart:updated", cart);
      socket.broadcast.emit("cart:updated", cart);
    } catch (error) {
      console.error("cart:remove error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("cart:updateQuantity", async (data) => {
    try {
      const Cart = require("./models/cartModel");
      const { productId, quantity } = data;

      const query = socket.userId ? { userId: socket.userId } : { sessionId: socket.sessionId };
      const cart = await Cart.findOne(query);

      if (!cart) return;

      if (quantity < 1) {
        cart.items = cart.items.filter((item) => item.productId !== productId);
      } else {
        const item = cart.items.find((item) => item.productId === productId);
        if (item) item.quantity = quantity;
      }

      cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      await cart.save();

      socket.emit("cart:updated", cart);
      socket.broadcast.emit("cart:updated", cart);
    } catch (error) {
      console.error("cart:updateQuantity error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("cart:sync", async (data) => {
    try {
      const Cart = require("./models/cartModel");
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

      socket.emit("cart:synced", cart);
    } catch (error) {
      console.error("cart:sync error:", error);
      socket.emit("cart:error", { message: error.message });
    }
  });

  socket.on("products:sync", async () => {
    try {
      const products = require("./data/product");
      socket.emit("products:synced", products);
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

// Routes Middleware
app.use("/api/users", userRoute);
app.use("/api/waitlist", waitlistRoute);
app.use("/api/cart", cartRoute);
app.use("/api/orders", orderRoute);
app.use("/api/products", productRoute);

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
const PORT = process.env.PORT || 5000;
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


  // I want you to track add the order tracking page as well as the contact us page, please do it for with the brand identity and asthetics ofo the UI of the app, also make it mobile responsive