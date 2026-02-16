const dotenv = require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const userRoute = require("./routes/userRoutes");
const waitlistRoute = require("./routes/waitlistRoutes");
const errorHandler = require("./middleware/errorMiddleware");

const app = express();

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
const defaultOrigins = ["http://localhost:3000", "http://localhost:3005"];
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

// Routes Middleware
app.use("/api/users", userRoute);
app.use("/api/waitlist", waitlistRoute);

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
    app.listen(PORT, () => {
      console.log(`Server Running on port ${PORT}`);
    });
  })
  .catch((err) => console.log(err));


  // I want you to track add the order tracking page as well as the contact us page, please do it for with the brand identity and asthetics ofo the UI of the app, also make it mobile responsive