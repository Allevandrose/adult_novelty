const IntaSend = require("intasend-node");
const crypto = require("crypto");

class IntaSendService {
  constructor() {
    this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
    this.secretKey = process.env.INTASEND_SECRET_KEY;
    this.isTest = process.env.INTASEND_ENVIRONMENT === "test";
    this.webhookSecret = process.env.INTASEND_WEBHOOK_SECRET;

    console.log("🔑 IntaSend Config:", {
      hasPublishableKey: !!this.publishableKey,
      hasSecretKey: !!this.secretKey,
      environment: this.isTest ? "test" : "production",
    });

    try {
      if (this.publishableKey && this.secretKey) {
        this.intasend = new IntaSend(
          this.publishableKey,
          this.secretKey,
          this.isTest,
        );
        this.collection = this.intasend.collection();
        console.log("✅ IntaSend initialized successfully");
      } else {
        console.error("❌ IntaSend: Missing API keys");
      }
    } catch (error) {
      console.error("❌ IntaSend initialization error:", error.message);
    }
  }

  async createCheckout(orderData) {
    try {
      if (!this.collection) {
        throw new Error("IntaSend not initialized - check your API keys");
      }

      // Get frontend URL
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

      const paymentData = {
        first_name: orderData.firstName || "Customer",
        last_name: orderData.lastName || "User",
        email: orderData.email,
        phone_number: orderData.phoneNumber,
        amount: orderData.amount,
        currency: "KES",
        api_ref: orderData.orderId,
        comment: `Payment for order ${orderData.orderId}`,
        redirect_url: `${frontendUrl}/checkout/success?order=${orderData.orderId}`,
      };

      console.log("📤 Sending to IntaSend:", {
        ...paymentData,
        phone_number: "***",
      });

      const response = await this.collection.charge(paymentData);
      console.log("📥 IntaSend Response:", JSON.stringify(response, null, 2));

      // Extract the URL and invoice ID from response
      const paymentUrl =
        response.redirect_url || response.url || response.invoice?.url;
      const invoiceId =
        response.invoice_id || response.invoice?.id || response.id;

      if (!paymentUrl) {
        console.error("❌ No payment URL in response:", response);
        throw new Error("Failed to get payment URL from IntaSend");
      }

      console.log("✅ Payment URL generated:", paymentUrl);
      console.log("✅ Invoice ID:", invoiceId);

      return {
        success: true,
        url: paymentUrl,
        invoiceId: invoiceId,
        orderId: orderData.orderId,
        response: response,
      };
    } catch (error) {
      console.error("❌ IntaSend checkout error:", error);
      console.error("❌ Error details:", error.response?.data || error.message);

      return {
        success: false,
        message: error.message || "Payment initialization failed",
        error: error.response?.data || error,
      };
    }
  }

  async checkStatus(invoiceId) {
    try {
      if (!this.collection) {
        throw new Error("IntaSend not initialized");
      }

      console.log(`🔍 Checking status for invoice: ${invoiceId}`);
      const response = await this.collection.status(invoiceId);

      console.log("🔍 Status response:", JSON.stringify(response, null, 2));

      // Extract state from response
      const state =
        response.invoice?.state ||
        response.state ||
        response.status ||
        "UNKNOWN";

      const isComplete =
        state === "COMPLETE" ||
        state === "completed" ||
        state === "success" ||
        state === "SUCCESS";

      const isFailed =
        state === "FAILED" || state === "failed" || state === "error";

      return {
        success: true,
        status: state,
        isComplete: isComplete,
        isFailed: isFailed,
        data: response,
        invoice: response.invoice || response,
      };
    } catch (error) {
      console.error("❌ IntaSend status check error:", error);
      return {
        success: false,
        message: error.message,
        error: error.response?.data || error,
      };
    }
  }

  // Helper method to verify webhook signature
  verifyWebhookSignature(body, signature) {
    try {
      if (!this.webhookSecret) {
        console.warn("⚠️ No webhook secret configured, skipping verification");
        return true;
      }

      const expectedSignature = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(JSON.stringify(body))
        .digest("hex");

      const isValid = signature === expectedSignature;
      console.log(
        `Webhook signature verification: ${isValid ? "✅ Valid" : "❌ Invalid"}`,
      );
      return isValid;
    } catch (error) {
      console.error("❌ Signature verification error:", error);
      return false;
    }
  }
}

module.exports = new IntaSendService();
