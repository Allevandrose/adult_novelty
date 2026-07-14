const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/database");
const logger = require("./utils/logger");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const cartRoutes = require("./routes/cartRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// --- FIX: Trust the proxy (Render) ---
app.set("trust proxy", 1);

// Connect to MongoDB
connectDB();

// Compression middleware
app.use(
  compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["upgrade"] === "websocket") return false;
      return compression.filter(req, res);
    },
  }),
);

// Helmet with optimized config
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

// ✅ FIXED CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5000",
  "https://intimacare.netlify.app",
  "https://adult-novelty.onrender.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is allowed
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin}`);
        // Don't throw error, just deny access
        return callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Allow-Origin",
    ],
    exposedHeaders: ["Content-Length", "X-Requested-With"],
    optionsSuccessStatus: 200,
    preflightContinue: false,
  }),
);

// Log all requests for debugging (optional - remove in production)
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

// General rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", apiLimiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/admin", adminRoutes);

// Error handling middleware (should be last)
const { errorHandler } = require("./middleware/errorHandler");
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
});

module.exports = app;
