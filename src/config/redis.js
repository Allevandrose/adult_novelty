const redis = require("redis");
const logger = require("../utils/logger");

let redisClient = null;
let isConnecting = false;

const connectRedis = async () => {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  if (isConnecting) {
    // Wait for connection attempt to finish
    await new Promise((resolve) => setTimeout(resolve, 100));
    return redisClient;
  }

  if (!process.env.REDIS_URL) {
    logger.warn("⚠️ Redis URL not provided, caching disabled");
    return null;
  }

  isConnecting = true;

  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error("Redis connection failed after 10 retries");
            return new Error("Redis connection failed");
          }
          return Math.min(retries * 100, 3000);
        },
        connectTimeout: 5000,
      },
      // ✅ FIX: Connection options
      disableOfflineQueue: true,
    });

    redisClient.on("error", (err) => {
      logger.error("Redis error:", err.message);
    });

    redisClient.on("connect", () => {
      logger.info("✅ Redis connected successfully");
      isConnecting = false;
    });

    redisClient.on("end", () => {
      logger.warn("⚠️ Redis connection ended");
      redisClient = null;
      isConnecting = false;
    });

    await redisClient.connect();
    isConnecting = false;
    return redisClient;
  } catch (error) {
    logger.error("❌ Redis connection failed:", error.message);
    redisClient = null;
    isConnecting = false;
    return null;
  }
};

// ✅ FIX: Cache helpers with better error handling
const getCache = async (key) => {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error("Cache get error:", error.message);
    return null;
  }
};

const setCache = async (key, value, ttl = 300) => {
  if (!redisClient) return false;
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    return true;
  } catch (error) {
    logger.error("Cache set error:", error.message);
    return false;
  }
};

const deleteCache = async (key) => {
  if (!redisClient) return false;
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error("Cache delete error:", error.message);
    return false;
  }
};

const clearCachePattern = async (pattern) => {
  if (!redisClient) return false;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    return true;
  } catch (error) {
    logger.error("Cache clear pattern error:", error.message);
    return false;
  }
};

// ✅ FIX: Initialize Redis when module loads
const initRedis = async () => {
  await connectRedis();
};

// Initialize but don't block startup
initRedis();

module.exports = {
  connectRedis,
  redisClient,
  getCache,
  setCache,
  deleteCache,
  clearCachePattern,
};
