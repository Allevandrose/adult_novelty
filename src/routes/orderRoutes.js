const express = require("express");
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getOrders,
  updateOrderStatus,
} = require("../controllers/orderController");
const auth = require("../middleware/auth");
const { isAdmin } = require("../middleware/role");

// ✅ Protected routes (any authenticated user)
router.post("/", auth, createOrder);
router.get("/my", auth, getMyOrders);
router.get("/:id", auth, getOrder);
router.put("/:id/cancel", auth, cancelOrder);

// ✅ Admin only routes
router.get("/", auth, isAdmin, getOrders);
router.put("/:id/status", auth, isAdmin, updateOrderStatus);

module.exports = router;
