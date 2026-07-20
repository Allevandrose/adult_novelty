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
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

// Required for Render/proxy environments
app.set("trust proxy", 1);

// Connect to MongoDB
connectDB();

// --- MIDDLEWARE ---

// 1. Request logging
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  }),
);

// 2. Compression
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

// 3. Helmet security
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  }),
);

// ============================================
// ✅ COMPLETE FIXED CORS CONFIGURATION
// ============================================
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5000",
  "http://localhost:3000",
  // "https://intimacare.onrender.com", // ✅ Your NEW frontend (Render)
  "https://intimacare.co.ke/",
  "https://adult-novelty.onrender.com", // ✅ Your backend
  /\.onrender\.com$/, // ✅ Any Render subdomain
];

// ✅ CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        return callback(null, true);
      }

      // Check if origin is allowed
      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed instanceof RegExp) {
          return allowed.test(origin);
        }
        return allowed === origin;
      });

      if (isAllowed) {
        return callback(null, true);
      }

      logger.warn(`❌ CORS blocked origin: ${origin}`);
      return callback(new Error(`CORS blocked: ${origin}`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-IntaSend-Signature",
      "x-intasend-signature",
    ],
    exposedHeaders: ["Content-Length", "X-Requested-With"],
    maxAge: 86400, // 24 hours
  }),
);

// ✅ Handle OPTIONS preflight requests
app.options("*", cors());

// 4. Rate Limiting (Excluded for webhook)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api", (req, res, next) => {
  if (req.originalUrl === "/api/payments/webhook") return next();
  apiLimiter(req, res, next);
});

// 5. Standard JSON parsing (Excluding webhook - handled at route level)
app.use((req, res, next) => {
  if (req.originalUrl === "/api/payments/webhook") {
    return next();
  }
  express.json({ limit: "10mb" })(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 6. Static files
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// ✅ Health check with CORS info
app.get("/health", (req, res) => {
  const origin = req.headers.origin || "unknown";
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    cors: {
      enabled: true,
      allowedOrigins: allowedOrigins
        .map((o) => (o instanceof RegExp ? o.toString() : o))
        .filter((o) => typeof o === "string"),
      requestOrigin: origin,
      isAllowed: allowedOrigins.some((allowed) => {
        if (allowed instanceof RegExp) return allowed.test(origin);
        return allowed === origin;
      }),
    },
  });
});

// ✅ CORS test endpoint
app.get("/api/test-cors", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working! ✅",
    origin: req.headers.origin || "unknown",
    method: req.method,
  });
});

// --- ROUTES ---
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/admin", adminRoutes);

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// --- ERROR HANDLING ---
app.use(errorHandler);

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📡 Allowed origins:`);
  allowedOrigins.forEach((origin) => {
    if (typeof origin === "string") {
      logger.info(`   - ${origin}`);
    }
  });
});

module.exports = app;
