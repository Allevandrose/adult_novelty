const IntaSend = require("intasend-node");
const crypto = require("crypto");
const logger = require("../utils/logger");

class IntaSendService {
  constructor() {
    this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
    this.secretKey = process.env.INTASEND_SECRET_KEY;
    this.isTest = process.env.INTASEND_ENVIRONMENT === "test";
    this.webhookSecret = process.env.INTASEND_WEBHOOK_SECRET;

    logger.info("🔑 IntaSend Config:", {
      hasPublishableKey: !!this.publishableKey,
      hasSecretKey: !!this.secretKey,
      environment: this.isTest ? "test" : "production",
      hasWebhookSecret: !!this.webhookSecret,
    });

    try {
      if (this.publishableKey && this.secretKey) {
        this.intasend = new IntaSend(
          this.publishableKey,
          this.secretKey,
          this.isTest,
        );
        this.collection = this.intasend.collection();
        logger.info("✅ IntaSend initialized successfully");
      } else {
        logger.error("❌ IntaSend: Missing API keys");
      }
    } catch (error) {
      logger.error("❌ IntaSend initialization error:", error.message);
    }
  }

  /**
   * Create payment checkout session
   */
  async createCheckout(orderData) {
    try {
      if (!this.collection) {
        throw new Error("IntaSend not initialized - check your API keys");
      }

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      const chargeData = {
        first_name: orderData.firstName || "Customer",
        last_name: orderData.lastName || "User",
        email: orderData.email,
        phone_number: orderData.phoneNumber || "",
        amount: orderData.amount,
        currency: "KES",
        api_ref: orderData.orderId,
        redirect_url:
          orderData.redirectUrl ||
          `${frontendUrl}/payment-success?order=${orderData.orderId}`,
      };

      logger.info("📤 Creating IntaSend Checkout:", {
        api_ref: chargeData.api_ref,
        amount: chargeData.amount,
        email: chargeData.email,
      });

      const response = await this.collection.charge(chargeData);

      const paymentUrl = response.url;

      if (!paymentUrl) {
        logger.error("❌ No payment URL in response:", response);
        throw new Error("Failed to get payment URL from IntaSend");
      }

      const invoiceId =
        response.invoice_id || response.invoice?.id || response.id;

      logger.info(`✅ Payment URL: ${paymentUrl}`);
      logger.info(`✅ Invoice ID: ${invoiceId}`);

      return {
        success: true,
        url: paymentUrl,
        invoiceId: invoiceId,
        orderId: orderData.orderId,
      };
    } catch (error) {
      logger.error("❌ IntaSend checkout error:", {
        message: error.message,
        response: error.response?.data || error.response,
      });

      return {
        success: false,
        message: error.message || "Payment initialization failed",
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Direct M-Pesa STK Push
   */
  async mpesaStkPush(paymentData) {
    try {
      if (!this.collection) {
        throw new Error("IntaSend not initialized");
      }

      const stkData = {
        first_name: paymentData.firstName || "Customer",
        last_name: paymentData.lastName || "User",
        email: paymentData.email,
        phone_number: paymentData.phoneNumber,
        amount: paymentData.amount,
        api_ref: paymentData.orderId,
        host: process.env.FRONTEND_URL || "http://localhost:5173",
      };

      logger.info("📤 Sending M-Pesa STK Push");
      const response = await this.collection.mpesaStkPush(stkData);

      return {
        success: true,
        invoiceId: response.invoice_id || response.id,
        message: "STK Push sent. Check your phone.",
        response,
      };
    } catch (error) {
      logger.error("❌ STK Push error:", error.message);

      return {
        success: false,
        message: error.message || "STK Push failed",
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Check payment status
   */
  async checkStatus(invoiceId) {
    try {
      if (!this.collection) {
        throw new Error("IntaSend not initialized");
      }

      logger.info(`🔍 Checking status for invoice: ${invoiceId}`);
      const response = await this.collection.status(invoiceId);

      const state = response.invoice?.state || response.state || "UNKNOWN";

      const isComplete = ["COMPLETE", "COMPLETED"].includes(
        state?.toUpperCase(),
      );
      const isFailed = ["FAILED", "FAIL"].includes(state?.toUpperCase());

      return {
        success: true,
        status: state,
        isComplete,
        isFailed,
        invoice: response.invoice || response,
      };
    } catch (error) {
      logger.error("❌ Status check error:", error.message);

      return {
        success: false,
        message: error.message,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * ✅ PROPER HMAC-SHA256 Webhook Verification
   *
   * IntaSend signs the raw request body with your webhook secret
   * using HMAC-SHA256 and sends the signature in a header.
   *
   * @param {Buffer|string} rawBody - The raw request body (must be a Buffer or raw string, NOT parsed JSON)
   * @param {string} signature - The signature from the X-IntaSend-Signature header
   * @returns {boolean} - True if signature is valid
   */
  verifyWebhookSignature(rawBody, signature) {
    try {
      // In development without secret, allow all
      if (!this.webhookSecret) {
        logger.warn("⚠️ No webhook secret configured, skipping verification");
        return true;
      }

      if (!signature) {
        logger.error("❌ No signature provided in webhook headers");
        return false;
      }

      if (!rawBody) {
        logger.error("❌ No body provided for signature verification");
        return false;
      }

      // ✅ Convert body to string if it's a Buffer
      const bodyString = Buffer.isBuffer(rawBody)
        ? rawBody.toString("utf8")
        : typeof rawBody === "string"
          ? rawBody
          : JSON.stringify(rawBody);

      // ✅ Create HMAC-SHA256 hash of the raw body using webhook secret
      const hmac = crypto.createHmac("sha256", this.webhookSecret);
      const computedSignature = hmac.update(bodyString).digest("hex");

      logger.debug("🔐 Webhook Signature Verification:", {
        received: signature?.substring(0, 20) + "...",
        computed: computedSignature?.substring(0, 20) + "...",
        bodyLength: bodyString.length,
      });

      // ✅ Use timing-safe comparison to prevent timing attacks
      try {
        const signatureBuffer = Buffer.from(signature, "utf8");
        const computedBuffer = Buffer.from(computedSignature, "utf8");

        const isValid =
          signatureBuffer.length === computedBuffer.length &&
          crypto.timingSafeEqual(signatureBuffer, computedBuffer);

        logger.info(
          `🔐 Webhook verification: ${isValid ? "✅ Valid" : "❌ Invalid"}`,
        );

        if (!isValid) {
          logger.warn("Signature mismatch - request may be fraudulent");
        }

        return isValid;
      } catch (compareError) {
        logger.error("❌ Signature comparison error:", compareError);
        return false;
      }
    } catch (error) {
      logger.error("❌ Signature verification error:", error);
      return false;
    }
  }
}

module.exports = new IntaSendService();
