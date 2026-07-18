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

// 4. CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5000",
  "https://intimacare.onrender.com",
  "https://adult-novelty.onrender.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logger.warn(`CORS blocked origin: ${origin}`);
      return callback(null, false);
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
    ],
    exposedHeaders: ["Content-Length", "X-Requested-With"],
  }),
);

// 5. Rate Limiting (Excluded for webhook)
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

// 6. Standard JSON parsing (Excluding webhook - handled at route level)
app.use((req, res, next) => {
  if (req.originalUrl === "/api/payments/webhook") {
    // Webhook route handles its own raw body parsing
    return next();
  }
  express.json({ limit: "10mb" })(req, res, next);
});

app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 7. Static files
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// --- ROUTES ---
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/admin", adminRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// --- ERROR HANDLING ---
app.use(errorHandler);

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
