const mongoose = require("mongoose");
const logger = require("../utils/logger");

const MAX_RETRIES = 5;
let retryCount = 0;

const connectDB = async () => {
  try {
    const options = {
      // ✅ FIX: Connection pool optimization for free tier
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 10000,

      // ✅ FIX: Timeout settings
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,

      // ✅ FIX: Production optimizations
      autoIndex: process.env.NODE_ENV !== "production",
      compressors: ["snappy", "zlib"],

      // ✅ FIX: Connection retry
      retryWrites: true,
      retryReads: true,

      // ✅ FIX: Use stable connection
      family: 4, // Use IPv4
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    logger.info(`📊 MongoDB Pool Size: ${options.maxPoolSize}`);

    // Reset retry count on successful connection
    retryCount = 0;

    // ✅ FIX: Better connection event handlers
    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected, attempting to reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected successfully");
    });

    return conn;
  } catch (error) {
    logger.error("❌ MongoDB connection failed:", error.message);

    // ✅ FIX: Exponential backoff with retry limit
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      logger.warn(`🔄 Retry ${retryCount}/${MAX_RETRIES} in ${delay}ms...`);

      setTimeout(connectDB, delay);
    } else {
      logger.error("❌ Maximum retries reached. Exiting...");
      process.exit(1);
    }
  }
};

// ✅ FIX: Handle process termination
process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed through app termination");
    process.exit(0);
  } catch (err) {
    logger.error("Error closing MongoDB connection:", err);
    process.exit(1);
  }
});

module.exports = connectDB;
