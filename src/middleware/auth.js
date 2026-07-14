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
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, no token provided",
      });
    }

    const token = authHeader.split(" ")[1];

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
        // ✅ FIX: Ensure consistent user object structure
        req.user = {
          _id: cachedUser._id || cachedUser.id,
          id: cachedUser._id || cachedUser.id,
          email: cachedUser.email,
          phone: cachedUser.phone,
          name: cachedUser.name || "",
          role: cachedUser.role || "user",
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

    // ✅ FIX: Consistent user object - BOTH _id and id present
    req.user = {
      _id: user._id,
      id: user._id.toString(),
      email: user.email,
      phone: user.phone,
      name: user.name || "",
      role: user.role || "user",
    };

    next();
  } catch (error) {
    logger.error("Auth middleware error:", error);
    res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }
};

module.exports = auth;
