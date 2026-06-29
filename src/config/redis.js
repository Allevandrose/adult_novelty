const redis = require("redis");
const logger = require("../utils/logger");

let redisClient = null;

const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    logger.warn("⚠️ Redis URL not provided, caching disabled");
    return null;
  }

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
      },
    });

    redisClient.on("error", (err) => {
      logger.error("Redis error:", err);
    });

    redisClient.on("connect", () => {
      logger.info("✅ Redis connected successfully");
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error("❌ Redis connection failed:", error.message);
    return null;
  }
};

// Cache helpers
const getCache = async (key) => {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error("Cache get error:", error);
    return null;
  }
};

const setCache = async (key, value, ttl = 300) => {
  if (!redisClient) return;
  try {
    await redisClient.set(key, JSON.stringify(value), { EX: ttl });
  } catch (error) {
    logger.error("Cache set error:", error);
  }
};

const deleteCache = async (key) => {
  if (!redisClient) return;
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error("Cache delete error:", error);
  }
};

const clearCachePattern = async (pattern) => {
  if (!redisClient) return;
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (error) {
    logger.error("Cache clear pattern error:", error);
  }
};

module.exports = {
  connectRedis,
  redisClient,
  getCache,
  setCache,
  deleteCache,
  clearCachePattern,
};
