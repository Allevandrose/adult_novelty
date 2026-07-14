// controllers/paymentController.js
const Order = require("../models/Order");
const Product = require("../models/Product");
const intaSendService = require("../services/intasendService");
const logger = require("../utils/logger");

/**
 * Initiate payment for an order
 * Supports both Checkout Link (Card + M-Pesa) and Direct M-Pesa STK Push
 * @route POST /api/payments/initiate
 */
const initiatePayment = async (req, res) => {
  try {
    const { orderId, paymentMethod = "checkout" } = req.body;

    logger.info("📤 Payment initiation request", {
      orderId,
      userId: req.user.id,
      paymentMethod,
    });

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await Order.findById(orderId).populate(
      "user",
      "email phone name",
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ✅ Authorization: Only order owner can initiate payment
    const orderUserId = order.user._id.toString();
    const requestUserId = req.user.id.toString();

    if (orderUserId !== requestUserId) {
      logger.warn("❌ Unauthorized payment attempt", {
        orderUser: orderUserId,
        requestUser: requestUserId,
      });
      return res.status(403).json({
        success: false,
        message: "Not authorized to pay for this order",
      });
    }

    // Check if order is already paid
    if (
      order.status === "paid" &&
      order.payment?.paymentStatus === "completed"
    ) {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    // Check if order can be paid
    if (!["pending", "processing", "payment_failed"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot pay for order with status: ${order.status}`,
      });
    }

    let result;

    if (paymentMethod === "mpesa") {
      // ✅ Direct M-Pesa STK Push (M-Pesa only, no checkout page)
      const stkData = {
        orderId: order.orderNumber,
        amount: order.totalAmount,
        email: order.user.email,
        phoneNumber:
          order.shippingAddress?.phone || order.user.phone || "254700000000",
        firstName:
          order.user.name || order.user.email?.split("@")[0] || "Customer",
        lastName: "",
      };

      logger.info("📤 Sending M-Pesa STK Push...");
      result = await intaSendService.mpesaStkPush(stkData);
    } else {
      // ✅ Universal Checkout Link (Card, M-Pesa, Google Pay, etc.)
      const checkoutData = {
        orderId: order.orderNumber,
        amount: order.totalAmount,
        email: order.user.email,
        phoneNumber: order.shippingAddress?.phone || order.user.phone || "",
        firstName:
          order.user.name || order.user.email?.split("@")[0] || "Customer",
        lastName: "",
        redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/payment-success?order=${order.orderNumber}`,
      };

      logger.info("📤 Creating IntaSend Checkout Link...");
      result = await intaSendService.createCheckout(checkoutData);
    }

    if (!result.success) {
      logger.error("❌ Payment initiation failed:", result.message);
      return res.status(500).json({
        success: false,
        message: result.message || "Failed to initiate payment",
      });
    }

    // ✅ Save payment info to order
    order.payment = {
      ...order.payment,
      method: paymentMethod === "mpesa" ? "mpesa" : "checkout",
      provider: "INTASEND",
      intasendInvoiceId: result.invoiceId,
      paymentStatus: "pending",
      redirectUrl: result.url || null,
      processedEvents: order.payment?.processedEvents || [], // Preserve existing processed events
    };

    if (order.status === "pending") {
      order.status = "processing";
    }

    await order.save();

    logger.info("✅ Payment initiated successfully", {
      orderNumber: order.orderNumber,
      invoiceId: result.invoiceId,
      method: paymentMethod,
    });

    res.json({
      success: true,
      message:
        paymentMethod === "mpesa"
          ? "STK Push sent. Check your phone to complete payment."
          : "Payment page ready. Redirect to complete payment.",
      data: {
        paymentUrl: result.url || null,
        invoiceId: result.invoiceId,
        orderId: order._id,
        orderNumber: order.orderNumber,
      },
    });
  } catch (error) {
    logger.error("❌ Initiate payment error:", error);
    res.status(500).json({
      success: false,
      message: "Error initiating payment",
    });
  }
};

/**
 * Handle IntaSend webhook
 * ✅ Uses raw body Buffer for HMAC-SHA256 verification
 * IntaSend calls this endpoint when payment status changes
 * @route POST /api/payments/webhook
 */
const handleWebhook = async (req, res) => {
  const startTime = Date.now();

  logger.info("📥 Webhook received");

  // ✅ req.body is a raw Buffer (thanks to express.raw() middleware)
  const rawBody = req.body;

  // Get signature from multiple possible header names
  const signature =
    req.headers["x-intasend-signature"] ||
    req.headers["X-IntaSend-Signature"] ||
    req.headers["signature"] ||
    req.headers["Signature"] ||
    "";

  logger.debug("Webhook details:", {
    hasSignature: !!signature,
    signaturePreview: signature ? signature.substring(0, 20) + "..." : "none",
    bodyType: typeof rawBody,
    isBuffer: Buffer.isBuffer(rawBody),
    bodyLength: rawBody ? rawBody.length : 0,
  });

  // ✅ Verify webhook signature using raw body (Buffer)
  const isValid = intaSendService.verifyWebhookSignature(rawBody, signature);

  if (!isValid) {
    logger.warn("❌ Invalid webhook signature");
    return res.status(403).json({
      success: false,
      message: "Invalid signature",
    });
  }

  // ✅ Parse the raw body Buffer to JSON object
  let parsedBody;
  try {
    parsedBody = Buffer.isBuffer(rawBody)
      ? JSON.parse(rawBody.toString("utf8"))
      : rawBody;
  } catch (parseError) {
    logger.error("❌ Failed to parse webhook body:", parseError);
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
    });
  }

  logger.debug("Parsed webhook body:", {
    api_ref: parsedBody.api_ref,
    state: parsedBody.state,
    invoice_id: parsedBody.invoice_id,
    event_id: parsedBody.event_id,
  });

  // Handle challenge verification (IntaSend sends this during webhook setup)
  if (parsedBody.challenge) {
    logger.info("🔑 Webhook challenge verification");
    return res.status(200).json({ challenge: parsedBody.challenge });
  }

  // ✅ Respond immediately to prevent timeout, then process async
  res.status(200).json({ received: true });

  // Process webhook asynchronously
  try {
    await processPaymentWebhook(parsedBody);
    logger.info(`✅ Webhook processed in ${Date.now() - startTime}ms`);
  } catch (error) {
    logger.error("❌ Webhook processing error:", error);
  }
};

/**
 * Internal helper: Process payment webhook data with idempotency
 * Updates order status based on payment state
 * ✅ Uses processedEvents array to prevent duplicate processing
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
      event_id, // ✅ IntaSend event ID for idempotency
    } = data;

    if (!api_ref) {
      logger.warn("❌ No api_ref in webhook data");
      return;
    }

    // Find order by order number (api_ref = orderNumber)
    const order = await Order.findOne({ orderNumber: api_ref });

    if (!order) {
      logger.warn(`❌ Order not found for: ${api_ref}`);
      return;
    }

    // ✅ IDEMPOTENCY CHECK: Skip if this specific event was already processed
    if (event_id) {
      // Ensure processedEvents array exists
      if (!order.payment.processedEvents) {
        order.payment.processedEvents = [];
      }

      if (order.payment.processedEvents.includes(event_id)) {
        logger.info(
          `ℹ️ Event ${event_id} already processed for order ${api_ref}`,
        );
        return;
      }
    }

    // Skip if already paid
    if (
      order.status === "paid" &&
      order.payment?.paymentStatus === "completed"
    ) {
      logger.info(`ℹ️ Order ${order.orderNumber} already paid, skipping`);
      // Still mark event as processed if it exists
      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
        await order.save();
      }
      return;
    }

    logger.info(
      `🔄 Processing webhook for order ${order.orderNumber}: ${state}`,
    );

    // ✅ Ensure payment object exists
    if (!order.payment) {
      order.payment = {};
    }

    if (state === "COMPLETE" || state === "completed" || state === "success") {
      // ✅ Payment successful - Update order and deduct stock
      order.status = "paid";
      order.payment = {
        ...order.payment,
        provider: provider || "INTASEND",
        paymentStatus: "completed",
        paidAt: new Date(),
        amountPaid: value || order.totalAmount,
        currency: currency || "KES",
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
        intasendTrackingId:
          data.tracking_id || order.payment?.intasendTrackingId,
      };

      // ✅ Deduct stock from products
      await deductStock(order);

      // ✅ Mark event as processed before saving
      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await order.save();
      logger.info(
        `✅✅✅ Order ${order.orderNumber} marked as PAID! Stock deducted. Event: ${event_id || "N/A"}`,
      );
    } else if (state === "FAILED" || state === "failed") {
      // ✅ Payment failed
      order.status = "payment_failed";
      order.payment = {
        ...order.payment,
        provider: provider || "INTASEND",
        paymentStatus: "failed",
        failedReason: failed_reason || "Payment failed",
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
      };

      // ✅ Mark event as processed before saving
      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await order.save();
      logger.warn(
        `❌ Payment failed for order ${order.orderNumber}: ${failed_reason}`,
      );
    } else if (state === "CANCELLED" || state === "cancelled") {
      // ✅ Payment cancelled
      order.payment = {
        ...order.payment,
        paymentStatus: "cancelled",
        failedReason: "Payment cancelled by user",
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
      };

      // ✅ Mark event as processed before saving
      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await order.save();
      logger.info(`ℹ️ Payment cancelled for order ${order.orderNumber}`);
    } else {
      // ✅ Other states (processing, pending, etc.)
      logger.info(`ℹ️ Order ${order.orderNumber} payment status: ${state}`);

      order.payment = {
        ...order.payment,
        paymentStatus: state.toLowerCase(),
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
        intasendTrackingId:
          data.tracking_id || order.payment?.intasendTrackingId,
      };

      // ✅ Mark event as processed before saving
      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await order.save();
    }
  } catch (error) {
    logger.error("❌ Process webhook error:", error);
    throw error;
  }
};

/**
 * Helper: Deduct stock from products after successful payment
 * ✅ Uses non-empty field matching for variants
 */
const deductStock = async (order) => {
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    // ✅ Match variant by non-empty fields only
    if (item.selectedVariant?.size || item.selectedVariant?.color) {
      const variant = product.variants.find((v) => {
        const sizeMatch =
          !item.selectedVariant.size || v.size === item.selectedVariant.size;
        const colorMatch =
          !item.selectedVariant.color || v.color === item.selectedVariant.color;
        return sizeMatch && colorMatch;
      });

      if (variant) {
        variant.stock = Math.max(0, variant.stock - item.quantity);
        logger.debug(
          `📦 Variant stock deducted: ${product.name} (${variant.color || ""} ${variant.size || ""}) ${variant.stock + item.quantity} → ${variant.stock}`,
        );
      }
    } else {
      product.stock = Math.max(0, product.stock - item.quantity);
      logger.debug(
        `📦 Product stock deducted: ${product.name} ${product.stock + item.quantity} → ${product.stock}`,
      );
    }

    await product.save();
  }
};

/**
 * Check payment status (User facing)
 * User can poll this to check if their payment was processed
 * @route GET /api/payments/status/:orderId
 */
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

    // ✅ Authorization check
    const orderUserId = order.user.toString();
    const requestUserId = req.user.id.toString();

    if (orderUserId !== requestUserId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Check with IntaSend for latest status
    let intaSendStatus = null;
    if (order.payment?.intasendInvoiceId) {
      const statusCheck = await intaSendService.checkStatus(
        order.payment.intasendInvoiceId,
      );

      if (statusCheck.success) {
        intaSendStatus = statusCheck;

        // Sync if IntaSend shows complete but our order doesn't
        if (statusCheck.isComplete && order.status !== "paid") {
          logger.info(
            `🔄 Syncing payment status for order ${order.orderNumber}`,
          );

          order.status = "paid";
          order.payment.paymentStatus = "completed";
          order.payment.paidAt = new Date();

          // Deduct stock
          await deductStock(order);
          await order.save();
        }
      }
    }

    res.json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        paymentStatus: order.payment?.paymentStatus || "pending",
        paymentMethod: order.payment?.method || null,
        isPaid:
          order.status === "paid" &&
          order.payment?.paymentStatus === "completed",
        intaSendStatus: intaSendStatus?.status || null,
        paidAt: order.payment?.paidAt || null,
        amount: order.totalAmount,
        processedEvents: order.payment?.processedEvents?.length || 0,
      },
    });
  } catch (error) {
    logger.error("Check payment status error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking payment status",
    });
  }
};

/**
 * Manual payment verification (Admin only)
 * Forces a sync with IntaSend for a specific order
 * @route GET /api/payments/verify/:orderId
 */
const verifyPaymentManually = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.payment?.intasendInvoiceId) {
      return res.status(400).json({
        success: false,
        message: "No payment record found for this order",
      });
    }

    logger.info(`🔍 Manual verification for order ${order.orderNumber}`);

    const statusCheck = await intaSendService.checkStatus(
      order.payment.intasendInvoiceId,
    );

    if (!statusCheck.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to verify with IntaSend",
        error: statusCheck.message,
      });
    }

    // Sync status if needed
    if (statusCheck.isComplete && order.status !== "paid") {
      logger.info(`✅ Manual sync: Marking order ${order.orderNumber} as paid`);

      order.status = "paid";
      order.payment.paymentStatus = "completed";
      order.payment.paidAt = new Date();

      await deductStock(order);
      await order.save();
    } else if (statusCheck.isFailed && order.status !== "payment_failed") {
      logger.info(
        `❌ Manual sync: Marking order ${order.orderNumber} as payment_failed`,
      );

      order.status = "payment_failed";
      order.payment.paymentStatus = "failed";
      await order.save();
    }

    res.json({
      success: true,
      message: "Verification complete",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        paymentStatus: order.payment?.paymentStatus,
        intaSendStatus: statusCheck.status,
        isComplete: statusCheck.isComplete,
        isFailed: statusCheck.isFailed,
        invoice: statusCheck.invoice || null,
        processedEvents: order.payment?.processedEvents?.length || 0,
      },
    });
  } catch (error) {
    logger.error("Manual verification error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying payment",
    });
  }
};

module.exports = {
  initiatePayment,
  handleWebhook,
  checkPaymentStatus,
  verifyPaymentManually,
};
