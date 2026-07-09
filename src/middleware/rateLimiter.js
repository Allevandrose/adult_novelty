const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

// ✅ NEW: Stricter rate limiter for authentication routes
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 attempts per window
  message: {
    success: false,
    message:
      "Too many authentication attempts. Please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

// ✅ NEW: Rate limiter for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour
  message: {
    success: false,
    message: "Too many password reset attempts. Please try again after 1 hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(
      `Password reset rate limit exceeded for IP: ${req.ip} for email: ${req.body.email}`,
    );
    res.status(options.statusCode).json(options.message);
  },
});

// ✅ NEW: Rate limiter for registration
const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: {
    success: false,
    message: "Too many registration attempts. Please try again after 1 hour.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Registration rate limit exceeded for IP: ${req.ip}`);
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = {
  authRateLimiter,
  passwordResetLimiter,
  registerRateLimiter,
};
