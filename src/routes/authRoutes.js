// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const authController = require("../controllers/authController");

// Public routes
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password/:token", authController.resetPassword);

// Protected routes
router.get("/me", auth, authController.getMe);
router.put("/me", auth, authController.updateProfile);

module.exports = router;
