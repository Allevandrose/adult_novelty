const Order = require("../models/Order");
const User = require("../models/User");
const Product = require("../models/Product");

// @desc     Get admin dashboard stats
// @route    GET /api/admin/stats
// @access   Private/Admin
const getDashboardStats = async (req, res) => {
  try {
    // ✅ Get total counts
    const totalUsers = await User.countDocuments();
    const totalProducts = await Product.countDocuments({ isActive: true });
    const totalOrders = await Order.countDocuments();

    // ✅ Get revenue statistics
    const revenueData = await Order.aggregate([
      { $match: { status: { $in: ["paid", "shipped", "delivered"] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
        },
      },
    ]);

    const totalRevenue =
      revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
    const paidOrdersCount =
      revenueData.length > 0 ? revenueData[0].totalOrders : 0;

    // ✅ Get orders by status
    const ordersByStatus = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = {};
    ordersByStatus.forEach((item) => {
      statusCounts[item._id] = item.count;
    });

    // ✅ Get recent orders (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentOrders = await Order.find({
      createdAt: { $gte: sevenDaysAgo },
    })
      .populate("user", "email")
      .sort({ createdAt: -1 })
      .limit(10);

    // ✅ Get revenue by day (last 7 days)
    const dailyRevenue = await Order.aggregate([
      {
        $match: {
          status: { $in: ["paid", "shipped", "delivered"] },
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ✅ Get top selling products
    const topProducts = await Order.aggregate([
      { $match: { status: { $in: ["paid", "shipped", "delivered"] } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          totalSold: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 5 },
    ]);

    // ✅ Get recent users
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("email phone createdAt");

    // ✅ FIXED: Get low stock products - Calculate total stock from variants
    // First, get all products with variants that have low stock
    const allProducts = await Product.find({
      isActive: true,
    }).lean();

    // Process each product to calculate total stock from variants
    const lowStockProducts = allProducts
      .map((product) => {
        // Calculate total stock from variants if they exist
        let totalStock = 0;
        let lowStockVariants = [];

        if (product.variants && product.variants.length > 0) {
          // Sum up all variant stocks
          totalStock = product.variants.reduce(
            (sum, v) => sum + (v.stock || 0),
            0,
          );

          // Find variants with low stock (less than 10)
          lowStockVariants = product.variants.filter(
            (v) => (v.stock || 0) < 10,
          );

          // Check if any variant has low stock
          const hasLowStockVariant = lowStockVariants.length > 0;

          // Include product if total stock is low OR any variant has low stock
          if (totalStock < 10 || hasLowStockVariant) {
            return {
              ...product,
              totalStock: totalStock,
              hasLowStockVariant: hasLowStockVariant,
              lowStockVariants: lowStockVariants,
              // For display purposes, show the total stock
              stock: totalStock,
            };
          }
        } else {
          // For products without variants, use the stock field
          totalStock = product.stock || 0;
          if (totalStock < 10) {
            return {
              ...product,
              totalStock: totalStock,
              hasLowStockVariant: false,
              lowStockVariants: [],
              stock: totalStock,
            };
          }
        }
        return null;
      })
      .filter((product) => product !== null)
      .slice(0, 5); // Limit to 5 products

    // ✅ Prepare response
    const stats = {
      // Summary cards
      summary: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
        paidOrders: paidOrdersCount,
      },

      // Order status breakdown
      orderStatus: {
        pending: statusCounts.pending || 0,
        processing: statusCounts.processing || 0,
        paid: statusCounts.paid || 0,
        shipped: statusCounts.shipped || 0,
        delivered: statusCounts.delivered || 0,
        cancelled: statusCounts.cancelled || 0,
      },

      // Recent data
      recentOrders,
      recentUsers,

      // Analytics
      dailyRevenue,
      topProducts,
      lowStockProducts,

      // Timestamps
      updatedAt: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("❌ Get dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

module.exports = {
  getDashboardStats,
};
