const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder, // 🆕 Imported cancelOrder controller
  getOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const auth = require("../middleware/auth");

// Protected routes (require login)
router.post("/", auth, createOrder);
router.get("/my", auth, getMyOrders);
router.get("/:id", auth, getOrder);
router.put("/:id/cancel", auth, cancelOrder); // 🆕 Registered order cancellation endpoint

// Admin only routes
router.get("/", auth, getOrders);
router.put("/:id/status", auth, updateOrderStatus);

module.exports = router;
