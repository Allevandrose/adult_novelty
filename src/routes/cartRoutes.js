// src/routes/cartRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  syncCart,
} = require("../controllers/cartController");

// All cart routes are protected
router.use(auth);

router.get("/", getCart);
router.post("/items", addToCart);
router.put("/items/:productId", updateCartItem);
router.delete("/items/:productId", removeFromCart);
router.delete("/", clearCart);
router.post("/sync", syncCart);

module.exports = router;
