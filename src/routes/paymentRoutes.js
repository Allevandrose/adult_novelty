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

// ✅ Webhook route - MUST use raw parser to get the raw body for signature verification
// This is the CORRECT place to apply the raw parser, NOT in index.js
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  handleWebhook,
);

// Protected routes - require authentication
router.post("/initiate", auth, initiatePayment);
router.get("/status/:orderId", auth, checkPaymentStatus);

// Admin only routes
router.get("/verify/:orderId", auth, isAdmin, verifyPaymentManually);

module.exports = router;
