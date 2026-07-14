const logger = require("../utils/logger");

/**
 * Middleware to check if user is admin
 */
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
  }

  if (req.user.role !== "admin") {
    logger.warn(`❌ Non-admin access attempt by user: ${req.user.id}`);
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin only.",
    });
  }

  next();
};

module.exports = { isAdmin };
