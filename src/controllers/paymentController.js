const Order = require("../models/Order");
const intaSendService = require("../services/intasendService");
const { sendEmail } = require("../services/emailService");

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

    // ✅ Prepare payment data
    const paymentData = {
      orderId: order.orderNumber,
      amount: order.totalAmount,
      email: order.user.email,
      phoneNumber: order.shippingAddress.phone || "0712345678",
      firstName: order.user.email.split("@")[0] || "Customer",
      lastName: "User",
    };

    console.log("📤 Initiating payment for order:", paymentData);

    const result = await intaSendService.createCheckout(paymentData);

    if (!result.success) {
      console.error("❌ Payment initiation failed:", result.message);
      return res.status(500).json({
        success: false,
        message: result.message || "Failed to initiate payment",
      });
    }

    // ✅ Save payment info - using generic field names instead of pesapal-specific
    order.payment = {
      method: "mpesa",
      intasendInvoiceId: result.invoiceId, // ✅ Renamed from pesapalOrderId
      paymentStatus: "pending",
      redirectUrl: result.url,
    };
    await order.save();

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
  try {
    console.log("📥 Webhook received:");
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    console.log("Body:", JSON.stringify(req.body, null, 2));

    const { invoice_id, state, api_ref, challenge, status } = req.body;

    // ✅ Handle webhook challenge
    if (challenge) {
      console.log("🔑 Webhook challenge received:", challenge);
      return res.status(200).json({ challenge });
    }

    // ✅ Respond immediately to prevent timeout
    res.status(200).send("OK");

    // ✅ Extract identifiers
    const invoiceId = invoice_id || req.body.invoice?.id;
    const orderRef = api_ref || req.body.api_ref || req.body.orderId;

    if (!invoiceId || !orderRef) {
      console.error("❌ Missing invoice_id or api_ref:", {
        invoiceId,
        orderRef,
      });
      return;
    }

    console.log(`📦 Processing: invoice=${invoiceId}, api_ref=${orderRef}`);

    // ✅ Find order by orderNumber
    const order = await Order.findOne({ orderNumber: orderRef }).populate(
      "user",
      "email phone",
    );

    if (!order) {
      console.error(`❌ Order not found: ${orderRef}`);
      return;
    }

    console.log(
      `📦 Order found: ${order.orderNumber}, Status: ${order.status}`,
    );

    if (order.status === "paid") {
      console.log(`⏭️ Order already paid: ${orderRef}`);
      return;
    }

    // ✅ Verify payment status with IntaSend
    const statusCheck = await intaSendService.checkStatus(invoiceId);

    if (!statusCheck.success) {
      console.error("❌ Status check failed:", statusCheck.message);
      return;
    }

    console.log(
      `🔍 Payment status: ${statusCheck.status}, Complete: ${statusCheck.isComplete}`,
    );

    // ✅ Check if payment is complete
    if (statusCheck.isComplete) {
      // ✅ Update order status to paid
      order.status = "paid";

      if (!order.payment) order.payment = {};
      order.payment.method = "mpesa";
      order.payment.intasendInvoiceId = invoiceId; // ✅ Renamed
      order.payment.paymentStatus = "completed";
      order.payment.paidAt = new Date();

      order.timeline.push({
        status: "paid",
        note: "Payment confirmed via IntaSend",
        timestamp: new Date(),
      });

      await order.save();

      console.log(`✅✅✅ Order ${order.orderNumber} marked as PAID!`);

      // ✅ Send email notification
      try {
        await sendEmail({
          to: order.user.email,
          subject: `Order Confirmation - ${order.orderNumber}`,
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
                    Payment Successful! ✅
                  </h2>
                  
                  <p style="color: #5C5348; line-height: 1.6; margin-bottom: 25px;">
                    Thank you for your order. Your payment has been confirmed successfully.
                  </p>
                  
                  <div class="order-number">
                    <strong>Order Number:</strong> ${order.orderNumber}
                  </div>
                  
                  <p style="color: #5C5348; font-size: 14px; margin-top: 20px;">
                    <strong>Total Amount:</strong> KES ${order.totalAmount}
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
        console.log(`📧 Order confirmation email sent to: ${order.user.email}`);
      } catch (emailError) {
        console.error(
          "❌ Failed to send confirmation email:",
          emailError.message,
        );
      }
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
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.payment?.paymentStatus || "pending",
        paidAt: order.payment?.paidAt || null,
        isPaid: order.status === "paid",
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
