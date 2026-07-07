const express = require("express");
const router = express.Router();
const { getDashboardStats } = require("../controllers/adminController");
const auth = require("../middleware/auth");

// ✅ Admin only routes
router.get("/stats", auth, getDashboardStats);

module.exports = router;
