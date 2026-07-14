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

// ✅ All cart routes require authentication
router.use(auth);

// ✅ Cart CRUD operations
router.get("/", getCart);
router.post("/items", addToCart);
router.put("/items/:itemId", updateCartItem); // ✅ Changed from :productId to :itemId
router.delete("/items/:itemId", removeFromCart); // ✅ Changed from :productId to :itemId
router.delete("/", clearCart);
router.post("/sync", syncCart);

module.exports = router;
