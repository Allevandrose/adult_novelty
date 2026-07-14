const Order = require("../models/Order");
const intaSendService = require("../services/intasendService");
const crypto = require("crypto");

/**
 * Initiate payment for an order
 */
const initiatePayment = async (req, res) => {
  try {
    const { orderId, paymentMethod = "checkout" } = req.body;

    console.log("📤 Payment initiation request for order:", orderId);
    console.log("👤 User:", req.user?.id);

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await Order.findById(orderId).populate("user", "email phone");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    console.log("📦 Order found:", order.orderNumber);
    console.log("💰 Amount:", order.totalAmount);

    // ✅ FIX: Convert both to strings for safe comparison
    const orderUserId = order.user._id.toString();
    const requestUserId = req.user.id.toString();

    console.log(`🔍 Comparing: "${orderUserId}" === "${requestUserId}"`);

    // Check authorization
    if (orderUserId !== requestUserId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to pay for this order",
      });
    }

    if (order.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    // Prepare payment data for IntaSend
    const paymentData = {
      orderId: order.orderNumber,
      amount: order.totalAmount,
      email: order.user.email,
      phoneNumber: order.shippingAddress?.phone || "254700000000",
      firstName: order.user.email.split("@")[0] || "Customer",
      lastName: "User",
    };

    console.log("📤 Sending to IntaSend for:", order.orderNumber);

    // Create checkout with IntaSend
    const result = await intaSendService.createCheckout(paymentData);

    if (!result.success) {
      console.error("❌ Payment initiation failed:", result.message);
      return res.status(500).json({
        success: false,
        message: result.message || "Failed to initiate payment",
        details:
          process.env.NODE_ENV === "development" ? result.error : undefined,
      });
    }

    // Save payment info
    order.payment = {
      method: "mpesa",
      intasendInvoiceId: result.invoiceId,
      paymentStatus: "pending",
      redirectUrl: result.url,
    };
    await order.save();

    console.log("✅ Payment initiated, Invoice ID:", result.invoiceId);

    res.json({
      success: true,
      data: {
        paymentUrl: result.url,
        invoiceId: result.invoiceId,
        orderId: order._id,
        orderNumber: order.orderNumber,
      },
    });
  } catch (error) {
    console.error("❌ Initiate payment error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/**
 * Handle IntaSend webhook
 */
const handleWebhook = async (req, res) => {
  console.log("📥 Webhook received at:", new Date().toISOString());

  // Respond immediately to prevent timeout
  res.status(200).send("OK");

  try {
    const body = req.body;

    // Handle challenge verification
    if (body.challenge) {
      console.log("🔑 Webhook challenge received");
      return;
    }

    await processPaymentWebhook(body);
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
  }
};

/**
 * Internal helper: Process payment webhook data
 */
const processPaymentWebhook = async (data) => {
  try {
    const {
      invoice_id,
      api_ref,
      state,
      provider,
      failed_reason,
      value,
      currency,
    } = data;

    if (!invoice_id || !api_ref) return;

    const order = await Order.findOne({ orderNumber: api_ref });
    if (!order || order.status === "paid") return;

    if (state === "COMPLETE") {
      order.status = "paid";
      order.payment = {
        ...order.payment,
        paymentStatus: "completed",
        paidAt: new Date(),
        provider,
        amountPaid: value,
        currency,
        invoiceId: invoice_id,
      };

      order.timeline.push({
        status: "paid",
        note: `Payment confirmed via IntaSend (Invoice: ${invoice_id})`,
        timestamp: new Date(),
      });

      await order.save();
      console.log(`✅✅✅ Order ${order.orderNumber} marked as PAID!`);
    } else if (state === "FAILED") {
      order.status = "payment_failed";
      order.timeline.push({
        status: "payment_failed",
        note: `Payment failed: ${failed_reason || "Unknown"}`,
        timestamp: new Date(),
      });
      await order.save();
    }
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    throw error;
  }
};

/**
 * Check payment status (User facing)
 */
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });

    // Authorization check
    if (
      order.user.toString() !== req.user.id.toString() &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });
    }

    let intaSendStatus = null;
    if (order.payment?.intasendInvoiceId) {
      const statusCheck = await intaSendService.checkStatus(
        order.payment.intasendInvoiceId,
      );

      if (statusCheck.success) {
        intaSendStatus = statusCheck;
        // Sync if needed
        if (statusCheck.isComplete && order.status !== "paid") {
          order.status = "paid";
          order.payment.paymentStatus = "completed";
          order.payment.paidAt = new Date();
          await order.save();
        }
      }
    }

    res.json({
      success: true,
      data: {
        orderStatus: order.status,
        paymentStatus: order.payment?.paymentStatus || "pending",
        intaSendStatus: intaSendStatus?.status || null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Manual verification (Admin only)
 */
const verifyPaymentManually = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order)
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    if (!order.payment?.intasendInvoiceId)
      return res
        .status(400)
        .json({ success: false, message: "No payment record" });

    const statusCheck = await intaSendService.checkStatus(
      order.payment.intasendInvoiceId,
    );

    if (statusCheck.isComplete && order.status !== "paid") {
      order.status = "paid";
      order.payment.paymentStatus = "completed";
      order.payment.paidAt = new Date();
      await order.save();
    }

    res.json({
      success: true,
      message: "Verification complete",
      data: { orderStatus: order.status },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  initiatePayment,
  handleWebhook,
  checkPaymentStatus,
  verifyPaymentManually,
};

