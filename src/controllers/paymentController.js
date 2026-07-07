const Order = require("../models/Order");
const intaSendService = require("../services/intasendService");

// Initiate payment for an order
const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

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

    const paymentData = {
      orderId: order.orderNumber,
      amount: order.totalAmount,
      email: order.user.email,
      phoneNumber: order.shippingAddress.phone,
      firstName: order.user.email.split("@")[0] || "Customer",
      lastName: "User",
    };

    const result = await intaSendService.createCheckout(paymentData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || "Failed to initiate payment",
      });
    }

    // ✅ Save payment info
    order.payment = {
      method: "mpesa",
      pesapalOrderId: result.invoiceId,
      paymentStatus: "pending",
    };
    await order.save();

    res.json({
      success: true,
      data: {
        paymentUrl: result.url,
        invoiceId: result.invoiceId,
        orderId: order._id,
      },
    });
  } catch (error) {
    console.error("❌ Initiate payment error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ FIXED: Handle IntaSend webhook
const handleWebhook = async (req, res) => {
  try {
    console.log("📥 Webhook received:");
    console.log("Body:", JSON.stringify(req.body, null, 2));

    const { invoice_id, state, api_ref, challenge } = req.body;

    if (challenge) {
      console.log("🔑 Webhook challenge received:", challenge);
      return res.status(200).json({ challenge });
    }

    // ✅ Respond immediately
    res.status(200).send("OK");

    if (!invoice_id || !api_ref) {
      console.error("❌ Missing invoice_id or api_ref");
      return;
    }

    console.log(`📦 Processing: invoice=${invoice_id}, api_ref=${api_ref}`);

    const order = await Order.findOne({ orderNumber: api_ref });

    if (!order) {
      console.error(`❌ Order not found: ${api_ref}`);
      return;
    }

    console.log(
      `📦 Order found: ${order.orderNumber}, Status: ${order.status}`,
    );

    if (order.status === "paid") {
      console.log(`⏭️ Order already paid: ${api_ref}`);
      return;
    }

    // ✅ Verify with IntaSend
    const statusCheck = await intaSendService.checkStatus(invoice_id);

    if (!statusCheck.success) {
      console.error("❌ Status check failed:", statusCheck.message);
      return;
    }

    console.log(`🔍 Payment status: ${statusCheck.status}`);

    // ✅ Check if complete
    if (statusCheck.isComplete) {
      order.status = "paid";

      if (!order.payment) order.payment = {};
      order.payment.method = "mpesa";
      order.payment.pesapalOrderId = invoice_id;
      order.payment.paymentStatus = "completed";
      order.payment.paidAt = new Date();

      order.timeline.push({
        status: "paid",
        note: "Payment confirmed via IntaSend",
        timestamp: new Date(),
      });

      await order.save();
      console.log(`✅✅✅ Order ${order.orderNumber} marked as PAID!`);
    } else {
      console.log(`⚠️ Payment not complete: ${statusCheck.status}`);
    }
  } catch (error) {
    console.error("❌ Webhook error:", error);
  }
};

// Check payment status
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      data: {
        status: order.status,
        paymentStatus: order.payment?.paymentStatus || "pending",
        paidAt: order.payment?.paidAt || null,
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

module.exports = {
  initiatePayment,
  handleWebhook,
  checkPaymentStatus,
};
