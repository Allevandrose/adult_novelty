const Order = require("../models/Order");
const intaSendService = require("../services/intasendService");
const crypto = require("crypto");

// Initiate payment for an order
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

    // Check authorization
    if (order.user._id.toString() !== req.user.id) {
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
      phoneNumber: order.shippingAddress.phone || "254700000000",
      firstName: order.user.email.split("@")[0] || "Customer",
      lastName: "User",
    };

    console.log("📤 Sending to IntaSend:", {
      ...paymentData,
      phoneNumber: "***",
    });

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

    console.log("✅ Payment initiated:", result.invoiceId);
    console.log("✅ Payment URL:", result.url);

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

// Handle IntaSend webhook
const handleWebhook = async (req, res) => {
  console.log("📥 Webhook received at:", new Date().toISOString());

  // Always respond immediately to prevent timeout
  res.status(200).send("OK");

  try {
    // Get the raw body and headers
    const body = req.body;
    const signature = req.headers["x-intasend-signature"];

    console.log("📥 Webhook body:", JSON.stringify(body, null, 2));
    console.log("🔑 Signature header:", signature);

    // Handle challenge verification
    if (body.challenge) {
      console.log("🔑 Webhook challenge received:", body.challenge);
      // Optionally validate the challenge
      if (body.challenge === process.env.INTASEND_WEBHOOK_CHALLENGE) {
        console.log("✅ Challenge verified");
      }
      return;
    }

    // Process payment webhook
    await processPaymentWebhook(body);
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
  }
};

// Process payment webhook data
const processPaymentWebhook = async (data) => {
  try {
    console.log("📥 Processing payment webhook...");

    const {
      invoice_id,
      api_ref,
      state,
      provider,
      failed_reason,
      value,
      currency,
    } = data;

    console.log(
      `📊 Payment ${state} for invoice: ${invoice_id}, ref: ${api_ref}`,
    );

    if (!invoice_id || !api_ref) {
      console.error("❌ Missing invoice_id or api_ref");
      return;
    }

    // Find order by orderNumber (api_ref)
    const order = await Order.findOne({ orderNumber: api_ref });

    if (!order) {
      console.error(`❌ Order not found: ${api_ref}`);
      return;
    }

    console.log(
      `📦 Found order: ${order.orderNumber}, current status: ${order.status}`,
    );

    // Check if already processed
    if (order.status === "paid") {
      console.log(`⏭️ Order ${order.orderNumber} already paid`);
      return;
    }

    // Update based on payment state
    if (state === "COMPLETE") {
      // Payment successful
      order.status = "paid";
      if (!order.payment) order.payment = {};
      order.payment.paymentStatus = "completed";
      order.payment.paidAt = new Date();
      order.payment.provider = provider;
      order.payment.amountPaid = value;
      order.payment.currency = currency;
      order.payment.invoiceId = invoice_id;

      order.timeline.push({
        status: "paid",
        note: `Payment confirmed via IntaSend webhook (Invoice: ${invoice_id})`,
        timestamp: new Date(),
      });

      await order.save();

      console.log(`✅✅✅ Order ${order.orderNumber} marked as PAID!`);
      console.log(`💰 Amount: ${value} ${currency}`);
    } else if (state === "FAILED") {
      // Payment failed
      order.status = "payment_failed";
      order.timeline.push({
        status: "payment_failed",
        note: `Payment failed: ${failed_reason || "Unknown reason"}`,
        timestamp: new Date(),
      });

      await order.save();
      console.log(
        `❌ Order ${order.orderNumber} payment failed: ${failed_reason}`,
      );
    } else if (state === "PENDING" || state === "PROCESSING") {
      // Payment in progress - just log
      console.log(`⏳ Payment for order ${order.orderNumber} is ${state}`);
      order.payment.paymentStatus = "processing";
      await order.save();
    }
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    throw error;
  }
};

// Check payment status
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log(`🔍 Checking payment status for order: ${orderId}`);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check authorization
    if (order.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // If we have an invoice ID, check with IntaSend
    let intaSendStatus = null;
    if (order.payment?.intasendInvoiceId) {
      console.log(
        `🔍 Checking with IntaSend: ${order.payment.intasendInvoiceId}`,
      );
      const statusCheck = await intaSendService.checkStatus(
        order.payment.intasendInvoiceId,
      );

      if (statusCheck.success) {
        intaSendStatus = statusCheck;
        console.log(`📊 IntaSend status: ${statusCheck.status}`);

        // Update order if payment is complete but we missed the webhook
        if (statusCheck.isComplete && order.status !== "paid") {
          console.log(
            `🔄 Order ${order.orderNumber} payment complete, updating...`,
          );
          order.status = "paid";
          order.payment.paymentStatus = "completed";
          order.payment.paidAt = new Date();
          await order.save();
          console.log(
            `✅ Order ${order.orderNumber} marked as PAID via status check`,
          );
        }
      }
    }

    res.json({
      success: true,
      data: {
        orderStatus: order.status,
        paymentStatus: order.payment?.paymentStatus || "pending",
        paidAt: order.payment?.paidAt || null,
        intaSendStatus: intaSendStatus?.status || null,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
      },
    });
  } catch (error) {
    console.error("❌ Check payment status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Manual payment verification (admin only)
const verifyPaymentManually = async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log(`🔍 Manual payment verification for order: ${orderId}`);

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status === "paid") {
      return res.json({
        success: true,
        message: "Order is already paid",
        data: { orderStatus: order.status },
      });
    }

    if (!order.payment?.intasendInvoiceId) {
      return res.status(400).json({
        success: false,
        message: "No payment record found for this order",
      });
    }

    const statusCheck = await intaSendService.checkStatus(
      order.payment.intasendInvoiceId,
    );

    if (!statusCheck.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to check payment status",
        details: statusCheck.message,
      });
    }

    if (statusCheck.isComplete) {
      order.status = "paid";
      order.payment.paymentStatus = "completed";
      order.payment.paidAt = new Date();
      await order.save();

      console.log(
        `✅ Order ${order.orderNumber} manually verified and marked as PAID`,
      );

      return res.json({
        success: true,
        message: "Payment verified and order updated",
        data: {
          orderStatus: order.status,
          paymentStatus: order.payment.paymentStatus,
        },
      });
    }

    res.json({
      success: true,
      message: `Payment status: ${statusCheck.status}`,
      data: {
        orderStatus: order.status,
        paymentStatus: order.payment?.paymentStatus,
        intaSendStatus: statusCheck.status,
      },
    });
  } catch (error) {
    console.error("❌ Manual verification error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  initiatePayment,
  handleWebhook,
  checkPaymentStatus,
  verifyPaymentManually,
};
