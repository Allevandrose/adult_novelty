const Order = require("../models/Order");
const Product = require("../models/Product");
const { generateOrderNumber } = require("../utils/generateOrderNumber");
const { sendEmail } = require("../services/emailService");

// ✅ Shipping configuration from environment variables
const SHIPPING_FEE = parseInt(process.env.SHIPPING_FEE) || 0;
const FREE_SHIPPING_THRESHOLD =
  parseInt(process.env.FREE_SHIPPING_THRESHOLD) || 0;

// @desc    Create order
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

    // After order is created, send confirmation email
    try {
      await sendEmail({
        to: req.user.email,
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
      console.log(`📧 Order confirmation email sent to: ${req.user.email}`);
    } catch (emailError) {
      console.error(
        "❌ Failed to send confirmation email:",
        emailError.message,
      );
    }

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

// ... (rest of the controller functions remain unchanged)

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
    console.error("Get order error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

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
