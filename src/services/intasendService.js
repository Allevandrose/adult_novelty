const IntaSend = require("intasend-node");
const crypto = require("crypto");
const logger = require("../utils/logger");

class IntaSendService {
  constructor() {
    this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
    this.secretKey = process.env.INTASEND_SECRET_KEY;
    // ✅ 'true' for test, 'false' for production
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
        // ✅ Match official SDK initialization
        this.intasend = new IntaSend(
          this.publishableKey,
          this.secretKey,
          this.isTest, // true = test mode, false = production
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
   * ✅ Checkout Link - Universal payment (M-Pesa, Card, etc.)
   * Returns a URL to redirect the customer to
   */
  async createCheckout(orderData) {
    try {
      if (!this.collection) {
        throw new Error("IntaSend not initialized - check your API keys");
      }

      const chargeData = {
        first_name: orderData.firstName || "Customer",
        last_name: orderData.lastName || "User",
        email: orderData.email,
        phone_number: orderData.phoneNumber || "",
        amount: orderData.amount,
        currency: "KES",
        api_ref: orderData.orderId, // Your unique order reference
        redirect_url:
          orderData.redirectUrl ||
          `${process.env.FRONTEND_URL || "http://localhost:5173"}/payment-success?order=${orderData.orderId}`,
      };

      logger.info("📤 Creating IntaSend Checkout:", {
        api_ref: chargeData.api_ref,
        amount: chargeData.amount,
        email: chargeData.email,
      });

      // ✅ Match official SDK: collection.charge()
      const response = await this.collection.charge(chargeData);

      logger.info("📥 IntaSend Response:", JSON.stringify(response, null, 2));

      // ✅ According to docs, the response contains 'url' directly
      const paymentUrl = response.url;

      if (!paymentUrl) {
        logger.error("❌ No payment URL in response:", response);
        throw new Error("Failed to get payment URL from IntaSend");
      }

      // Extract invoice ID from response
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
   * ✅ Direct M-Pesa STK Push (No checkout page)
   * Sends STK prompt directly to user's phone
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

      logger.info("📤 Sending M-Pesa STK Push:", {
        api_ref: stkData.api_ref,
        amount: stkData.amount,
        phone: stkData.phone_number,
      });

      // ✅ Match official SDK: collection.mpesaStkPush()
      const response = await this.collection.mpesaStkPush(stkData);

      logger.info("📥 STK Push Response:", JSON.stringify(response, null, 2));

      return {
        success: true,
        invoiceId: response.invoice_id || response.id,
        message: "STK Push sent. Check your phone.",
        response,
      };
    } catch (error) {
      logger.error("❌ STK Push error:", {
        message: error.message,
        response: error.response?.data || error.response,
      });

      return {
        success: false,
        message: error.message || "STK Push failed",
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * ✅ Check payment status
   * Use this to verify payment in webhook or manually
   */
  async checkStatus(invoiceId) {
    try {
      if (!this.collection) {
        throw new Error("IntaSend not initialized");
      }

      logger.info(`🔍 Checking status for invoice: ${invoiceId}`);

      // ✅ Match official SDK: collection.status()
      const response = await this.collection.status(invoiceId);

      logger.info("📊 Status Response:", JSON.stringify(response, null, 2));

      // Extract state from response
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
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature) {
    try {
      if (!this.webhookSecret) {
        logger.warn("⚠️ No webhook secret configured, skipping verification");
        return true;
      }

      if (!signature) {
        logger.error("❌ No signature in webhook");
        return false;
      }

      const expectedSignature = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(JSON.stringify(body))
        .digest("hex");

      const isValid = signature === expectedSignature;
      logger.info(`🔐 Webhook: ${isValid ? "✅ Valid" : "❌ Invalid"}`);

      return isValid;
    } catch (error) {
      logger.error("❌ Signature verification error:", error);
      return false;
    }
  }
}

module.exports = new IntaSendService();
