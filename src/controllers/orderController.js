const Order = require("../models/Order");
const Product = require("../models/Product");
const { generateOrderNumber } = require("../utils/generateOrderNumber");
const { sendEmail } = require("../services/emailService");
const logger = require("../utils/logger");

// Shipping configuration from environment variables
const SHIPPING_FEE = parseInt(process.env.SHIPPING_FEE) || 0;
const FREE_SHIPPING_THRESHOLD =
  parseInt(process.env.FREE_SHIPPING_THRESHOLD) || 0;

// @desc    Create order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, notes } = req.body;

    logger.info("📥 Received order request");
    logger.debug("  Items:", JSON.stringify(items, null, 2));
    logger.debug("  Shipping Address:", shippingAddress);
    logger.debug("  User ID:", req.user.id);

    // Validate items
    if (!items || items.length === 0) {
      logger.warn("❌ No items in order");
      return res.status(400).json({
        success: false,
        message: "Order must contain at least one item",
      });
    }

    // Validate shipping address
    if (!shippingAddress || !shippingAddress.phone) {
      logger.warn("❌ Missing shipping address or phone");
      return res.status(400).json({
        success: false,
        message: "Shipping address with phone number is required",
      });
    }

    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      logger.debug(`🔍 Looking for product: ${item.productId}`);

      if (!item.productId) {
        logger.warn("❌ Missing productId in item:", item);
        return res.status(400).json({
          success: false,
          message: "Each item must have a productId",
        });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        logger.warn(`❌ Product not found: ${item.productId}`);
        return res.status(404).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      logger.debug(`✅ Product found: ${product.name}`);

      const hasValidVariant =
        item.selectedVariant?.size || item.selectedVariant?.color;

      if (hasValidVariant) {
        logger.debug(`🔍 Looking for variant:`, {
          size: item.selectedVariant.size,
          color: item.selectedVariant.color,
        });

        const variant = product.variants.find(
          (v) =>
            v.size === item.selectedVariant.size &&
            v.color === item.selectedVariant.color,
        );

        if (!variant) {
          const available = product.variants
            .map(
              (v) =>
                `${v.color || "No color"} ${v.size || "No size"} (stock: ${v.stock})`,
            )
            .join(", ");

          logger.warn(`❌ Variant not found. Available: ${available}`);
          return res.status(400).json({
            success: false,
            message: `Variant "${item.selectedVariant.color} ${item.selectedVariant.size}" not found. Available variants: ${available}`,
          });
        }

        if (variant.stock < item.quantity) {
          logger.warn(
            `❌ Insufficient stock: ${variant.stock} < ${item.quantity}`,
          );
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
        if (product.stock < item.quantity) {
          logger.warn(
            `❌ Insufficient stock: ${product.stock} < ${item.quantity}`,
          );
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

    // Calculate shipping
    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const totalAmount = subtotal + shippingCost;

    logger.info(
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

    logger.info(`✅ Order created: ${orderNumber}`);

    // ✅ FIX: Send email in background (non-blocking) with setImmediate
    setImmediate(async () => {
      try {
        const user = req.user;
        await sendEmail({
          to: user.email,
          subject: `Order Confirmation - ${orderNumber}`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; background: #F7F3EA; padding: 40px 20px; }
                  .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border: 1px solid #E6DFD1; }
                  .header { text-align: center; border-bottom: 1px solid #E6DFD1; padding-bottom: 20px; margin-bottom: 30px; }
                  .logo { font-family: Georgia, serif; font-size: 24px; color: #14120F; }
                  .order-number { background: #FBF9F4; padding: 15px; font-size: 14px; color: #5C5348; margin: 20px 0; border-left: 3px solid #B08D4F; }
                  .button { display: inline-block; background: #14120F; color: #F7F3EA; padding: 12px 40px; text-decoration: none; letter-spacing: 0.15em; text-transform: uppercase; font-size: 12px; border: none; cursor: pointer; }
                  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #E6DFD1; text-align: center; font-size: 12px; color: #8C7B6B; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <div class="logo">IntimaCare</div>
                  </div>
                  <h2 style="font-family: Georgia, serif; font-weight: 300; color: #14120F; margin-bottom: 10px;">
                    Order Received! 📦
                  </h2>
                  <p style="color: #5C5348; line-height: 1.6; margin-bottom: 25px;">
                    Thank you for your order. We'll notify you once payment is confirmed.
                  </p>
                  <div class="order-number">
                    <strong>Order Number:</strong> ${orderNumber}
                  </div>
                  <p style="color: #5C5348; font-size: 14px; margin-top: 20px;">
                    <strong>Total Amount:</strong> KES ${totalAmount}
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/orders/${order._id}" class="button">
                      View Order Details
                    </a>
                  </div>
                  <div class="footer">
                    <p>© ${new Date().getFullYear()} IntimaCare. All rights reserved.</p>
                    <p style="margin-top: 10px;">Discreet packaging • Secure payment</p>
                  </div>
                </div>
              </body>
            </html>
          `,
        });
        logger.info(`📧 Order confirmation email sent to: ${user.email}`);
      } catch (emailError) {
        logger.error(
          "❌ Failed to send confirmation email:",
          emailError.message,
        );
      }
    });

    // ✅ Send response immediately (don't wait for email)
    return res.status(201).json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error("❌ Create order error:", error);
    logger.error("❌ Error stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack,
        details: error.toString(),
      }),
    });
  }
};

// @desc    Get user's orders
// @route   GET /api/orders/myorders
// @access  Private
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
    logger.error("Get my orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
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
    logger.error("Get order error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this order",
      });
    }

    if (!["pending", "processing"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled. Current status: ${order.status}`,
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
    logger.error("Cancel order error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get all orders (admin only)
// @route   GET /api/orders
// @access  Private/Admin
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
    logger.error("Get orders error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update order status (admin only)
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
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
        if (product) {
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
    }

    await order.save();

    // Send email notification for status update
    setImmediate(async () => {
      try {
        await sendEmail({
          to: order.user.email,
          subject: `Order Update - ${order.orderNumber}`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; background: #F7F3EA; padding: 40px 20px; }
                  .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border: 1px solid #E6DFD1; }
                  .header { text-align: center; border-bottom: 1px solid #E6DFD1; padding-bottom: 20px; margin-bottom: 30px; }
                  .logo { font-family: Georgia, serif; font-size: 24px; color: #14120F; }
                  .status-box { background: #FBF9F4; padding: 15px; font-size: 14px; color: #5C5348; margin: 20px 0; border-left: 3px solid #B08D4F; }
                  .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #E6DFD1; text-align: center; font-size: 12px; color: #8C7B6B; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <div class="logo">IntimaCare</div>
                  </div>
                  <h2 style="font-family: Georgia, serif; font-weight: 300; color: #14120F; margin-bottom: 10px;">
                    Order Status Update
                  </h2>
                  <p style="color: #5C5348; line-height: 1.6; margin-bottom: 25px;">
                    Your order <strong>${order.orderNumber}</strong> status has been updated to:
                  </p>
                  <div class="status-box">
                    <strong>Status:</strong> ${status.toUpperCase()}
                  </div>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/orders/${order._id}" class="button" style="display: inline-block; background: #14120F; color: #F7F3EA; padding: 12px 40px; text-decoration: none; letter-spacing: 0.15em; text-transform: uppercase; font-size: 12px; border: none; cursor: pointer;">
                      View Order
                    </a>
                  </div>
                  <div class="footer">
                    <p>© ${new Date().getFullYear()} IntimaCare. All rights reserved.</p>
                  </div>
                </div>
              </body>
            </html>
          `,
        });
        logger.info(`📧 Status update email sent to: ${order.user.email}`);
      } catch (emailError) {
        logger.error(
          "❌ Failed to send status update email:",
          emailError.message,
        );
      }
    });

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    logger.error("Update order status error:", error);
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
