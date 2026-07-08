const IntaSend = require("intasend-node");

class IntaSendService {
  constructor() {
    this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
    this.secretKey = process.env.INTASEND_SECRET_KEY;
    this.isTest = process.env.INTASEND_ENVIRONMENT === "test";

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

      const paymentData = {
        first_name: orderData.firstName || "Customer",
        last_name: orderData.lastName || "User",
        email: orderData.email,
        phone_number: orderData.phoneNumber,
        amount: orderData.amount,
        currency: "KES",
        api_ref: orderData.orderId,
        host: process.env.FRONTEND_URL || "http://localhost:5173",
        redirect_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/checkout/success?order=${orderData.orderId}`,
      };

      console.log("📤 Sending to IntaSend:", {
        ...paymentData,
        // Mask sensitive data
        phone_number: paymentData.phone_number ? "***" : undefined,
      });

      const response = await this.collection.charge(paymentData);
      console.log("📥 IntaSend Response:", response);

      const invoiceId = response.invoice_id || response.invoice?.id;

      return {
        success: true,
        url: response.redirect_url || response.url,
        invoiceId: invoiceId,
        orderId: orderData.orderId,
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

      const response = await this.collection.status(invoiceId);
      console.log(
        "🔍 Status check response:",
        JSON.stringify(response, null, 2),
      );

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

      return {
        success: true,
        status: state,
        isComplete: isComplete,
        data: response,
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
}

module.exports = new IntaSendService();
