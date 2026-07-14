const Order = require("../models/Order");
const Product = require("../models/Product");
const { generateOrderNumber } = require("../utils/generateOrderNumber");
const logger = require("../utils/logger");

// Shipping configuration
const SHIPPING_FEE = parseInt(process.env.SHIPPING_FEE) || 0;
const FREE_SHIPPING_THRESHOLD =
  parseInt(process.env.FREE_SHIPPING_THRESHOLD) || 0;

// @desc    Create order from cart/checkout
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, notes } = req.body;

    // ✅ Use logger consistently
    logger.info("📥 Order creation request", {
      userId: req.user.id,
      itemCount: items?.length || 0,
    });

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one item",
      });
    }

    // Validate shipping address
    if (!shippingAddress || !shippingAddress.phone) {
      return res.status(400).json({
        success: false,
        message: "Shipping address with phone number is required",
      });
    }

    let subtotal = 0;
    const orderItems = [];

    // Process each item
    for (const item of items) {
      if (!item.productId) {
        return res.status(400).json({
          success: false,
          message: "Each item must have a productId",
        });
      }

      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      if (!product.isActive) {
        return res.status(400).json({
          success: false,
          message: `${product.name} is no longer available`,
        });
      }

      const quantity = item.quantity || 1;
      let itemPrice = product.price;

      // Handle variants
      if (item.selectedVariant?.size || item.selectedVariant?.color) {
        const variant = product.variants.find(
          (v) =>
            v.size === item.selectedVariant.size &&
            v.color === item.selectedVariant.color,
        );

        if (!variant) {
          return res.status(400).json({
            success: false,
            message: `Selected variant not available for ${product.name}`,
          });
        }

        if (variant.stock < quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${variant.stock}`,
          });
        }

        itemPrice = variant.price || product.price;
      } else {
        if (product.stock < quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
          });
        }
      }

      subtotal += itemPrice * quantity;

      orderItems.push({
        product: product._id,
        name: product.name,
        price: itemPrice,
        quantity,
        selectedVariant: {
          size: item.selectedVariant?.size || "",
          color: item.selectedVariant?.color || "",
        },
      });
    }

    // Calculate shipping
    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const totalAmount = subtotal + shippingCost;

    // Generate unique order number
    const orderNumber = generateOrderNumber();

    // ✅ Create order with consistent user ID
    const order = await Order.create({
      orderNumber,
      user: req.user.id,
      items: orderItems,
      subtotal,
      shippingCost,
      totalAmount,
      shippingAddress: {
        street: shippingAddress.street || "",
        city: shippingAddress.city || "",
        county: shippingAddress.county || "",
        postalCode: shippingAddress.postalCode || "",
        phone: shippingAddress.phone,
      },
      notes: notes || "",
      status: "pending",
      timeline: [
        {
          status: "pending",
          timestamp: new Date(),
          note: "Order created",
        },
      ],
    });

    logger.info(`✅ Order created: ${orderNumber}`, {
      orderId: order._id,
      userId: req.user.id,
      total: totalAmount,
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });
  } catch (error) {
    logger.error("❌ Create order error:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating order",
    });
  }
};

// @desc    Get current user's orders
// @route   GET /api/orders/my
// @access  Private
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product", "name images price")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    logger.error("Get my orders error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
    });
  }
};

// @desc    Get single order by ID
// @route   GET /api/orders/:id
// @access  Private (owner or admin)
const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("items.product", "name images slug price")
      .populate("user", "email phone name");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ✅ Authorization: Order owner or admin
    const orderUserId = order.user._id?.toString() || order.user.toString();
    const requestUserId = (req.user.id || req.user._id).toString();

    if (orderUserId !== requestUserId && req.user.role !== "admin") {
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
    logger.error("Get order error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order",
    });
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private (owner or admin)
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ✅ Authorization check
    const orderUserId = order.user.toString();
    const requestUserId = (req.user.id || req.user._id).toString();

    if (orderUserId !== requestUserId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // ✅ Check if order can be cancelled
    if (!order.canCancel()) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order with status: ${order.status}`,
      });
    }

    order.status = "cancelled";
    await order.save();

    logger.info(`✅ Order cancelled: ${order.orderNumber}`);

    res.json({
      success: true,
      message: "Order cancelled",
      data: order,
    });
  } catch (error) {
    logger.error("Cancel order error:", error);
    res.status(500).json({
      success: false,
      message: "Error cancelling order",
    });
  }
};

// @desc    Get all orders (Admin only)
// @route   GET /api/orders
// @access  Private/Admin
const getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { "shippingAddress.phone": { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("user", "email phone name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    res.json({
      success: true,
      count: orders.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: orders,
    });
  } catch (error) {
    logger.error("Get orders error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
    });
  }
};

// @desc    Update order status (Admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const { status, note } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const previousStatus = order.status;
    order.status = status;

    // ✅ Deduct stock when order is marked as paid
    if (status === "paid" && previousStatus !== "paid") {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          if (item.selectedVariant?.size) {
            const variant = product.variants.find(
              (v) =>
                v.size === item.selectedVariant.size &&
                v.color === item.selectedVariant.color,
            );
            if (variant) {
              variant.stock = Math.max(0, variant.stock - item.quantity);
            }
          } else {
            product.stock = Math.max(0, product.stock - item.quantity);
          }
          await product.save();
        }
      }

      // Update payment status
      if (order.payment) {
        order.payment.paymentStatus = "completed";
        order.payment.paidAt = new Date();
      }

      logger.info(`📦 Stock deducted for order: ${order.orderNumber}`);
    }

    await order.save();

    logger.info(
      `✅ Order ${order.orderNumber} status: ${previousStatus} → ${status}`,
    );

    res.json({
      success: true,
      message: "Order status updated",
      data: order,
    });
  } catch (error) {
    logger.error("Update order status error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating order status",
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
