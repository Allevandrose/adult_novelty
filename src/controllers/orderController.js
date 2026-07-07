const Order = require("../models/Order");
const Product = require("../models/Product");
const { generateOrderNumber } = require("../utils/generateOrderNumber");

// ✅ Shipping configuration from environment variables
const SHIPPING_FEE = parseInt(process.env.SHIPPING_FEE) || 0;
const FREE_SHIPPING_THRESHOLD =
  parseInt(process.env.FREE_SHIPPING_THRESHOLD) || 0;

// @desc     Create order
// @route    POST /api/orders
// @access   Private
const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, notes } = req.body;

    // ✅ DEBUG: Log the received data
    console.log("📥 Received order request:");
    console.log("  Items:", JSON.stringify(items, null, 2));
    console.log("  Shipping Address:", shippingAddress);
    console.log("  Notes:", notes);
    console.log("  User ID:", req.user.id);
    console.log(
      `📦 Shipping: Fee=${SHIPPING_FEE}, Free threshold=${FREE_SHIPPING_THRESHOLD}`,
    );

    // ✅ Check if items exist
    if (!items || items.length === 0) {
      console.log("❌ No items in order");
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one item",
      });
    }

    // ✅ Check shipping address
    if (!shippingAddress || !shippingAddress.phone) {
      console.log("❌ Missing shipping address or phone");
      return res.status(400).json({
        success: false,
        message: "Shipping address with phone number is required",
      });
    }

    // ✅ Validate each item
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      console.log(`🔍 Looking for product: ${item.productId}`);

      // ✅ Check if productId exists
      if (!item.productId) {
        console.log("❌ Missing productId in item:", item);
        return res.status(400).json({
          success: false,
          message: "Each item must have a productId",
        });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        console.log(`❌ Product not found: ${item.productId}`);
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      console.log(`✅ Product found: ${product.name}`);

      // ✅ Check if variant has actual values
      const hasValidVariant =
        item.selectedVariant?.size || item.selectedVariant?.color;

      if (hasValidVariant) {
        // Find the specific variant
        const variant = product.variants.find(
          (v) =>
            v.size === item.selectedVariant.size &&
            v.color === item.selectedVariant.color,
        );

        if (!variant) {
          return res.status(400).json({
            success: false,
            message: `Variant not found for ${product.name} - ${item.selectedVariant.color} ${item.selectedVariant.size}`,
          });
        }

        if (variant.stock < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name} - ${item.selectedVariant.color} ${item.selectedVariant.size}. Available: ${variant.stock}`,
          });
        }

        const itemPrice = variant.price || product.price;
        subtotal += itemPrice * item.quantity;

        orderItems.push({
          product: product._id,
          name: product.name,
          price: itemPrice,
          quantity: item.quantity,
          selectedVariant: {
            size: item.selectedVariant.size || "",
            color: item.selectedVariant.color || "",
          },
        });
      } else {
        // No variant - use product stock
        if (product.stock < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
          });
        }

        const itemPrice = product.price;
        subtotal += itemPrice * item.quantity;

        orderItems.push({
          product: product._id,
          name: product.name,
          price: itemPrice,
          quantity: item.quantity,
          selectedVariant: {},
        });
      }
    }

    // ✅ Calculate shipping using environment variables
    // If subtotal is 0, charge shipping fee (shouldn't happen with valid items)
    // If subtotal >= FREE_SHIPPING_THRESHOLD, free shipping
    // Otherwise, charge SHIPPING_FEE
    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const totalAmount = subtotal + shippingCost;

    console.log(
      `💰 Order totals: Subtotal=${subtotal}, Shipping=${shippingCost}, Total=${totalAmount}`,
    );

    // Generate order number
    const orderNumber = generateOrderNumber();

    const order = await Order.create({
      orderNumber,
      user: req.user.id,
      items: orderItems,
      subtotal,
      shippingCost,
      totalAmount,
      shippingAddress,
      notes: notes || "",
      status: "pending",
      timeline: [
        {
          status: "pending",
          note: "Order created",
        },
      ],
    });

    console.log(`✅ Order created: ${orderNumber}`);

    res.status(201).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("❌ Create order error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// @desc     Get user's orders
// @route    GET /api/orders/myorders
// @access   Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product", "name images")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("Get my orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc     Get single order
// @route    GET /api/orders/:id
// @access   Private
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("items.product", "name images slug")
      .populate("user", "email phone");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user owns this order or is admin
    if (
      order.user._id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this order",
      });
    }

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc     Cancel order (user owned context)
// @route    PUT /api/orders/:id/cancel
// @access   Private
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if user owns this order
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this order",
      });
    }

    // Only allow cancellation if status is pending or processing
    if (!["pending", "processing"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: "Order cannot be cancelled. Current status: " + order.status,
      });
    }

    order.status = "cancelled";
    order.timeline.push({
      status: "cancelled",
      note: "Order cancelled by user",
    });

    await order.save();

    res.json({
      success: true,
      data: order,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel order error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc     Get all orders (admin only)
// @route    GET /api/orders
// @access   Private/Admin
const getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await Order.find(query)
      .populate("user", "email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      count: orders.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: orders,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc     Update order status (admin only)
// @route    PUT /api/orders/:id/status
// @access   Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const validStatuses = [
      "pending",
      "processing",
      "paid",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    order.status = status;
    order.timeline.push({
      status,
      note: note || `Order ${status}`,
    });

    // If status is paid, update stock
    if (status === "paid") {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (item.selectedVariant && item.selectedVariant.size) {
          const variant = product.variants.find(
            (v) =>
              v.size === item.selectedVariant.size &&
              v.color === item.selectedVariant.color,
          );
          if (variant) {
            variant.stock -= item.quantity;
          }
        } else {
          product.stock -= item.quantity;
        }
        await product.save();
      }
    }

    await order.save();

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getOrders,
  updateOrderStatus,
};
