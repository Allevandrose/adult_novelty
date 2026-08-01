// services/intasendService.js

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
        this.payouts = this.intasend.payouts();
        logger.info("✅ IntaSend initialized successfully");
      } else {
        logger.error("❌ IntaSend: Missing API keys");
      }
    } catch (error) {
      logger.error("❌ IntaSend initialization error:", error.message);
    }
  }

  /**
   * ✅ Helper: Normalize provider value for enum compatibility
   * Converts "M-PESA" to "MPESA" for database enum
   */
  normalizeProvider(provider) {
    if (!provider) return "INTASEND";
    const normalized = provider.toUpperCase().trim();
    if (
      normalized === "M-PESA" ||
      normalized === "M-PESA" ||
      normalized === "MPESA"
    ) {
      return "MPESA";
    }
    return normalized;
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

      // ✅ FIXED: Use the correct success URL with proper parameters
      // IntaSend will redirect to this URL after payment with status parameters
      const successUrl = `${frontendUrl}/payment-success?order=${orderData.orderId}&status=success`;
      const cancelUrl = `${frontendUrl}/payment-success?order=${orderData.orderId}&status=failed`;

      const chargeData = {
        first_name: orderData.firstName || "Customer",
        last_name: orderData.lastName || "User",
        email: orderData.email,
        phone_number: orderData.phoneNumber || "",
        amount: orderData.amount,
        currency: "KES",
        api_ref: orderData.orderId,
        // ✅ FIXED: Use separate redirect_url for success and cancel
        redirect_url: successUrl,
        // IntaSend may use these additional fields
        success_redirect_url: successUrl,
        cancel_redirect_url: cancelUrl,
      };

      logger.info("📤 Creating IntaSend Checkout:", {
        api_ref: chargeData.api_ref,
        amount: chargeData.amount,
        email: chargeData.email,
        redirect_url: chargeData.redirect_url,
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

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      const stkData = {
        first_name: paymentData.firstName || "Customer",
        last_name: paymentData.lastName || "User",
        email: paymentData.email,
        phone_number: paymentData.phoneNumber,
        amount: paymentData.amount,
        api_ref: paymentData.orderId,
        // ✅ FIXED: Use proper redirect URL for STK Push
        host: frontendUrl,
        redirect_url: `${frontendUrl}/payment-success?order=${paymentData.orderId}&status=success`,
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
   */
  verifyWebhookSignature(rawBody, signature) {
    try {
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

      const bodyString = Buffer.isBuffer(rawBody)
        ? rawBody.toString("utf8")
        : typeof rawBody === "string"
          ? rawBody
          : JSON.stringify(rawBody);

      const hmac = crypto.createHmac("sha256", this.webhookSecret);
      const computedSignature = hmac.update(bodyString).digest("hex");

      logger.debug("🔐 Webhook Signature Verification:", {
        received: signature?.substring(0, 20) + "...",
        computed: computedSignature?.substring(0, 20) + "...",
        bodyLength: bodyString.length,
      });

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

  /**
   * ✅ Generate test signature for webhook testing
   */
  generateTestSignature(rawBody) {
    try {
      if (!this.webhookSecret) {
        logger.error(
          "❌ Cannot generate signature: No webhook secret configured",
        );
        return null;
      }

      const bodyString = Buffer.isBuffer(rawBody)
        ? rawBody.toString("utf8")
        : typeof rawBody === "string"
          ? rawBody
          : JSON.stringify(rawBody);

      const hmac = crypto.createHmac("sha256", this.webhookSecret);
      hmac.update(bodyString);
      const signature = hmac.digest("hex");

      logger.debug("🔐 Generated test signature:", {
        signature: signature.substring(0, 20) + "...",
      });

      return signature;
    } catch (error) {
      logger.error("❌ Test signature generation error:", error);
      return null;
    }
  }
}

module.exports = new IntaSendService();
