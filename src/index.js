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

// Connect to MongoDB
connectDB();

// ✅ FIX: Compression middleware - add EARLY in middleware chain
app.use(
  compression({
    level: 6, // Balanced compression
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Skip compression for SSE/WebSocket connections
      if (req.headers["upgrade"] === "websocket") return false;
      return compression.filter(req, res);
    },
  }),
);

// ✅ FIX: Helmet with optimized config
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // Disable if you need inline scripts
  }),
);

// CORS - Allow all origins in development
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Content-Length", "X-Requested-With"],
    optionsSuccessStatus: 200,
  }),
);

// ✅ FIX: Route-specific rate limiting
// Stricter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 attempts per 15 minutes for auth
  message: "Too many authentication attempts, please try again later",
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 requests per 15 minutes for API
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general API rate limiting
app.use("/api", apiLimiter);
// Apply strict rate limiting to auth routes
app.use("/api/auth", authLimiter);

// ✅ FIX: Request timeout middleware
app.use((req, res, next) => {
  // Set timeout to 30 seconds
  req.setTimeout(30000, () => {
    res.status(408).json({
      success: false,
      message: "Request timeout",
    });
  });
  next();
});

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ✅ FIX: Serve static files with caching headers
app.use(
  "/uploads",
  express.static(path.join(__dirname, "../public/uploads"), {
    maxAge: "7d", // Cache for 7 days
    setHeaders: (res, filePath) => {
      // Only set CORS for images
      if (filePath.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    },
  }),
);

// Logging - Optimized for production
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  // In production, log only errors via morgan
  app.use(
    morgan("combined", {
      skip: (req, res) => res.statusCode < 400,
      stream: { write: (message) => logger.info(message.trim()) },
    }),
  );
}

// ✅ FIX: Enhanced health check with more details
app.get("/health", (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
    },
    mongodb:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    redis: process.env.REDIS_URL ? "configured" : "not configured",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/admin", adminRoutes);

// Root route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "IntimaCare API is running",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      api: "/api",
      products: "/api/products",
      categories: "/api/categories",
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// ✅ FIX: Enhanced error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Server error";

  logger.error(`Error: ${message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? "Server error" : message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📁 Environment: ${process.env.NODE_ENV}`);
  logger.info(`✅ CORS: All origins allowed`);
  logger.info(`📁 Uploads served from: /uploads`);
  logger.info(`✅ Compression: Enabled`);
  logger.info(`✅ Rate Limiting: Enabled`);
});

// ✅ FIX: Graceful shutdown
const gracefulShutdown = () => {
  logger.info("🔄 Received shutdown signal, closing server...");
  server.close(async () => {
    logger.info("✅ HTTP server closed");

    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info("✅ MongoDB connection closed");

    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.warn("⚠️ Force shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

module.exports = app;
