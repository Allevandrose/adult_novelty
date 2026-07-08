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
            message: `Variant not found. Available: ${available}`,
          });
        }

        if (variant.stock < item.quantity) {
          logger.warn(`❌ Insufficient stock`);
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}. Available: ${variant.stock}`,
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
          logger.warn(`❌ Insufficient stock`);
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}.`,
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
      timeline: [{ status: "pending", note: "Order created" }],
    });

    logger.info(`✅ Order created: ${orderNumber}`);

    /* // TEMPORARILY DISABLED EMAIL TO STOP CRASHING
    setImmediate(async () => {
      try {
        await sendEmail({...});
      } catch (emailError) {
        logger.error("❌ Failed to send email:", emailError.message);
      }
    });
    */

    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    logger.error("❌ Create order error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product", "name images")
      .sort({ createdAt: -1 });
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    logger.error("Get my orders error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("items.product", "name images slug")
      .populate("user", "email phone");
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    if (
      order.user._id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    logger.error("Get order error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    if (order.user.toString() !== req.user.id)
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    if (!["pending", "processing"].includes(order.status)) {
      return res.status(400).json({ success: false, message: "Cannot cancel" });
    }
    order.status = "cancelled";
    order.timeline.push({
      status: "cancelled",
      note: "Order cancelled by user",
    });
    await order.save();
    res.json({ success: true, data: order });
  } catch (error) {
    logger.error("Cancel error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orders = await Order.find(query)
      .populate("user", "email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await Order.countDocuments(query);
    res.json({ success: true, count: orders.length, total, data: orders });
  } catch (error) {
    logger.error("Get orders error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    order.status = status;
    order.timeline.push({ status, note: note || `Order ${status}` });

    if (status === "paid") {
      for (const item of order.items) {
        const product = await Product.findById(item.product);
        if (product) {
          if (item.selectedVariant?.size) {
            const variant = product.variants.find(
              (v) =>
                v.size === item.selectedVariant.size &&
                v.color === item.selectedVariant.color,
            );
            if (variant) variant.stock -= item.quantity;
          } else {
            product.stock -= item.quantity;
          }
          await product.save();
        }
      }
    }
    await order.save();
    res.json({ success: true, data: order });
  } catch (error) {
    logger.error("Update status error:", error);
    res.status(500).json({ success: false, message: "Server error" });
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
