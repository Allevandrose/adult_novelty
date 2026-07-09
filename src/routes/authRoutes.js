const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const authController = require("../controllers/authController");
const { validate, validateAuth } = require("../middleware/validation");
const {
  authRateLimiter,
  passwordResetLimiter,
  registerRateLimiter,
} = require("../middleware/rateLimiter");

// Public routes with validation and rate limiting
router.post(
  "/register",
  registerRateLimiter,
  validateAuth.register,
  validate,
  authController.register,
);

router.post(
  "/login",
  authRateLimiter,
  validateAuth.login,
  validate,
  authController.login,
);

router.post(
  "/forgot-password",
  passwordResetLimiter,
  validateAuth.forgotPassword,
  validate,
  authController.forgotPassword,
);

router.post(
  "/reset-password/:token",
  passwordResetLimiter,
  validateAuth.resetPassword,
  validate,
  authController.resetPassword,
);

// Refresh token route
router.post("/refresh-token", authController.refreshToken);

// Protected routes
router.get("/me", auth, authController.getMe);
router.put(
  "/me",
  auth,
  validateAuth.updateProfile,
  validate,
  authController.updateProfile,
);

// Logout route
router.post("/logout", auth, authController.logout);

module.exports = router;
