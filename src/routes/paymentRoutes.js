const express = require("express");
const router = express.Router();
const {
  initiatePayment,
  handleWebhook,
  checkPaymentStatus,
  verifyPaymentManually,
} = require("../controllers/paymentController");
const auth = require("../middleware/auth");
const { isAdmin } = require("../middleware/role");

// ✅ Webhook route uses raw body parser for HMAC verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }), // Get raw buffer
  handleWebhook,
);

// Protected routes - require authentication
router.post("/initiate", auth, initiatePayment);
router.get("/status/:orderId", auth, checkPaymentStatus);

// Admin only routes
router.get("/verify/:orderId", auth, isAdmin, verifyPaymentManually);

module.exports = router;
