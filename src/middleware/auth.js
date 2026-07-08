const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

// Make Redis optional
let getCache = null;
let setCache = null;
try {
  const redis = require("../config/redis");
  getCache = redis.getCache;
  setCache = redis.setCache;
} catch (e) {
  logger.warn("⚠️ Redis not available - continuing without cache");
  getCache = async () => null;
  setCache = async () => {};
}

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired",
          expired: true,
        });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    // Try cache first (if Redis is available)
    try {
      const cachedUser = await getCache(`user:${decoded.id}`);
      if (cachedUser) {
        // ✅ FIX: Ensure both id and _id are set
        req.user = {
          ...cachedUser,
          id: cachedUser._id || cachedUser.id || decoded.id,
          _id: cachedUser._id || cachedUser.id || decoded.id,
        };
        return next();
      }
    } catch (cacheError) {
      logger.debug("Cache miss or error:", cacheError.message);
    }

    // Fallback to database
    const user = await User.findById(decoded.id)
      .select("-password -__v")
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // ✅ FIX: Add 'id' field for compatibility
    req.user = {
      ...user,
      id: user._id, // Add this for cart controller
    };
    next();
  } catch (error) {
    logger.error("Auth error:", error.message);
    res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }
};

module.exports = auth;
