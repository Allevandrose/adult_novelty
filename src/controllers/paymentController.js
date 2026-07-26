const Order = require("../models/Order");
const Product = require("../models/Product");
const intaSendService = require("../services/intasendService");
const logger = require("../utils/logger");
const crypto = require("crypto");

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
      processedEvents: order.payment?.processedEvents || [],
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
 * Handles IntaSend webhooks
 * Properly distinguishes between challenge verification and payment events
 * @route POST /api/payments/webhook
 */
const handleWebhook = async (req, res) => {
  const startTime = Date.now();

  const rawBody = req.body;
  const signature =
    req.headers["x-intasend-signature"] ||
    req.headers["X-IntaSend-Signature"] ||
    "";
  const secret = process.env.INTASEND_WEBHOOK_SECRET;
  const isDev = process.env.NODE_ENV === "development";

  // 🐛 DEBUG logging
  console.log("\n=== WEBHOOK DEBUG ===");
  console.log(
    "Raw Body Type:",
    Buffer.isBuffer(rawBody) ? "Buffer" : typeof rawBody,
  );
  console.log("Raw Body Length:", rawBody ? rawBody.length : 0);
  console.log("Signature present:", !!signature);
  console.log(
    "Signature value:",
    signature ? signature.substring(0, 30) + "..." : "NONE",
  );
  console.log("Secret present:", !!secret);
  console.log("NODE_ENV:", process.env.NODE_ENV);

  if (Buffer.isBuffer(rawBody) && rawBody.length > 0) {
    const preview = rawBody.toString("utf8").substring(0, 200);
    console.log("Body Preview:", preview + "...");
  }
  console.log("=== END DEBUG ===\n");

  let parsedBody;
  try {
    const bodyString = Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : typeof rawBody === "string"
        ? rawBody
        : JSON.stringify(rawBody);
    parsedBody = JSON.parse(bodyString);
  } catch (parseError) {
    logger.error("❌ Failed to parse webhook body:", parseError);
    return res.status(400).json({
      success: false,
      message: "Invalid JSON body",
    });
  }

  const bodyChallenge = parsedBody.challenge;
  const queryChallenge = req.query.challenge;
  const isChallengeRequest = bodyChallenge || queryChallenge;

  if (isChallengeRequest) {
    const challengeValue = bodyChallenge || queryChallenge;
    logger.info("🔑 Webhook challenge verification received");
    console.log("Challenge value:", challengeValue);
    console.log("Challenge source:", bodyChallenge ? "body" : "query");

    return res.status(200).send(challengeValue);
  }

  logger.info("📥 Processing payment webhook event");

  if (!isDev && !signature) {
    logger.error("❌ No signature header provided in production");
    return res.status(401).json({
      success: false,
      message: "No signature provided",
    });
  }

  if (signature && secret && !isDev) {
    try {
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        logger.error("❌ Invalid or empty raw body");
        return res.status(400).json({
          success: false,
          message: "Invalid request body",
        });
      }

      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(rawBody);
      const computedSignature = hmac.digest("hex");

      console.log("=== SIGNATURE VERIFICATION ===");
      console.log("Computed:", computedSignature);
      console.log("Received:", signature);

      const isValid = crypto.timingSafeEqual(
        Buffer.from(computedSignature, "hex"),
        Buffer.from(signature, "hex"),
      );

      console.log("Match:", isValid ? "✅ YES" : "❌ NO");
      console.log("=== END VERIFICATION ===\n");

      if (!isValid) {
        logger.warn("❌ Invalid webhook signature - possible fraud attempt");
        return res.status(403).json({
          success: false,
          message: "Invalid signature",
        });
      }

      logger.info("✅ Webhook signature verified successfully");
    } catch (error) {
      logger.error("❌ Signature verification error:", error);
      return res.status(500).json({
        success: false,
        message: "Verification error",
      });
    }
  } else if (isDev) {
    logger.info("⚠️ Development mode - skipping signature verification");
  }

  res.status(200).json({
    success: true,
    message: "Webhook received",
    received: true,
  });

  try {
    await processPaymentWebhook(parsedBody);
    logger.info(`✅ Webhook processed in ${Date.now() - startTime}ms`);
  } catch (error) {
    logger.error("❌ Webhook processing error:", error);
  }
};

/**
 * Process payment webhook data with idempotency
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
      event_id,
      tracking_id,
      charge_id,
    } = data;

    logger.info(`📥 Processing webhook for api_ref: ${api_ref}`);

    if (!api_ref) {
      logger.warn("❌ No api_ref in webhook data");
      logger.debug("Full webhook data:", JSON.stringify(data, null, 2));
      return;
    }

    const order = await Order.findOne({ orderNumber: api_ref });

    if (!order) {
      logger.warn(`❌ Order not found for api_ref: ${api_ref}`);
      logger.debug("Full webhook data:", JSON.stringify(data, null, 2));
      return;
    }

    logger.info(
      `📦 Found order: ${order.orderNumber} (current status: ${order.status})`,
    );

    if (!order.payment) {
      order.payment = {};
    }

    if (!order.payment.processedEvents) {
      order.payment.processedEvents = [];
    }

    if (event_id && order.payment.processedEvents.includes(event_id)) {
      logger.info(
        `ℹ️ Event ${event_id} already processed for ${order.orderNumber}`,
      );
      return;
    }

    if (
      order.status === "paid" &&
      order.payment?.paymentStatus === "completed"
    ) {
      logger.info(`ℹ️ Order ${order.orderNumber} already paid, skipping`);
      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
        await order.save();
      }
      return;
    }

    const normalizedState = (state || "").toUpperCase();
    logger.info(
      `🔄 Processing state: ${normalizedState} for order ${order.orderNumber}`,
    );

    if (
      ["COMPLETE", "COMPLETED", "SUCCESS", "SUCCESSFUL"].includes(
        normalizedState,
      )
    ) {
      order.status = "paid";
      order.payment = {
        ...order.payment,
        provider: provider || "INTASEND",
        paymentStatus: "completed",
        paidAt: new Date(),
        amountPaid: parseFloat(value) || order.totalAmount,
        currency: currency || "KES",
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
        intasendTrackingId: tracking_id || order.payment?.intasendTrackingId,
        intasendChargeId: charge_id || order.payment?.intasendChargeId,
      };

      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await deductStock(order);
      await order.save();

      logger.info(`✅✅✅ Order ${order.orderNumber} PAID! Stock deducted.`);
      logger.info(`📊 Payment details: ${currency} ${value} via ${provider}`);
    } else if (["FAILED", "FAIL"].includes(normalizedState)) {
      order.status = "payment_failed";
      order.payment = {
        ...order.payment,
        provider: provider || "INTASEND",
        paymentStatus: "failed",
        failedReason: failed_reason || "Payment failed",
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
        intasendTrackingId: tracking_id || order.payment?.intasendTrackingId,
      };

      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await order.save();
      logger.warn(
        `❌ Payment failed for ${order.orderNumber}: ${failed_reason || "Unknown reason"}`,
      );
    } else if (["CANCELLED", "CANCEL", "CANCELED"].includes(normalizedState)) {
      order.payment = {
        ...order.payment,
        paymentStatus: "cancelled",
        failedReason: "Payment cancelled by user",
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
        intasendTrackingId: tracking_id || order.payment?.intasendTrackingId,
      };

      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await order.save();
      logger.info(`ℹ️ Payment cancelled for ${order.orderNumber}`);
    } else {
      logger.info(
        `ℹ️ Payment status update: ${normalizedState} for ${order.orderNumber}`,
      );

      order.payment = {
        ...order.payment,
        paymentStatus: normalizedState.toLowerCase(),
        intasendInvoiceId: invoice_id || order.payment?.intasendInvoiceId,
        intasendTrackingId: tracking_id || order.payment?.intasendTrackingId,
        intasendChargeId: charge_id || order.payment?.intasendChargeId,
      };

      if (event_id && !order.payment.processedEvents.includes(event_id)) {
        order.payment.processedEvents.push(event_id);
      }

      await order.save();
    }

    logger.info(
      `📊 Order ${order.orderNumber} now has ${order.payment.processedEvents.length} processed events`,
    );
  } catch (error) {
    logger.error("❌ Process webhook error:", error);
    throw error;
  }
};

/**
 * Helper: Deduct stock from products after successful payment
 * Uses non-empty field matching for variants
 */
const deductStock = async (order) => {
  logger.info(`📦 Deducting stock for order ${order.orderNumber}`);

  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      logger.warn(`⚠️ Product not found: ${item.product}`);
      continue;
    }

    if (item.selectedVariant?.size || item.selectedVariant?.color) {
      const variant = product.variants.find((v) => {
        const sizeMatch =
          !item.selectedVariant.size || v.size === item.selectedVariant.size;
        const colorMatch =
          !item.selectedVariant.color || v.color === item.selectedVariant.color;
        return sizeMatch && colorMatch;
      });

      if (variant) {
        const oldStock = variant.stock;
        variant.stock = Math.max(0, variant.stock - item.quantity);
        logger.debug(
          `📦 Variant stock: ${product.name} (${variant.color || ""} ${variant.size || ""}) ${oldStock} → ${variant.stock}`,
        );
        await product.save();
      } else {
        logger.warn(
          `⚠️ Variant not found for ${product.name}:`,
          item.selectedVariant,
        );
      }
    } else {
      const oldStock = product.stock;
      product.stock = Math.max(0, product.stock - item.quantity);
      logger.debug(
        `📦 Product stock: ${product.name} ${oldStock} → ${product.stock}`,
      );
      await product.save();
    }
  }

  logger.info(`✅ Stock deduction complete for order ${order.orderNumber}`);
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

    const orderUserId = order.user.toString();
    const requestUserId = req.user.id.toString();

    if (orderUserId !== requestUserId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    let intaSendStatus = null;
    if (order.payment?.intasendInvoiceId) {
      const statusCheck = await intaSendService.checkStatus(
        order.payment.intasendInvoiceId,
      );

      if (statusCheck.success) {
        intaSendStatus = statusCheck;

        if (statusCheck.isComplete && order.status !== "paid") {
          logger.info(
            `🔄 Syncing payment status for order ${order.orderNumber}`,
          );

          order.status = "paid";
          if (!order.payment) order.payment = {};
          order.payment.paymentStatus = "completed";
          order.payment.paidAt = new Date();

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

    if (statusCheck.isComplete && order.status !== "paid") {
      logger.info(`✅ Manual sync: Marking order ${order.orderNumber} as paid`);

      order.status = "paid";
      if (!order.payment) order.payment = {};
      order.payment.paymentStatus = "completed";
      order.payment.paidAt = new Date();

      await deductStock(order);
      await order.save();

      logger.info(`✅ Order ${order.orderNumber} successfully synced to PAID`);
    } else if (statusCheck.isFailed && order.status !== "payment_failed") {
      logger.info(
        `❌ Manual sync: Marking order ${order.orderNumber} as payment_failed`,
      );

      order.status = "payment_failed";
      if (!order.payment) order.payment = {};
      order.payment.paymentStatus = "failed";
      await order.save();

      logger.info(
        `✅ Order ${order.orderNumber} successfully synced to PAYMENT_FAILED`,
      );
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
