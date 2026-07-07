const IntaSend = require("intasend-node");

class IntaSendService {
  constructor() {
    this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
    this.secretKey = process.env.INTASEND_SECRET_KEY;
    this.isTest = process.env.INTASEND_ENVIRONMENT === "test";

    this.intasend = new IntaSend(
      this.publishableKey,
      this.secretKey,
      this.isTest,
    );
  }

  async createCheckout(orderData) {
    try {
      const collection = this.intasend.collection();

      const paymentData = {
        first_name: orderData.firstName || "Customer",
        last_name: orderData.lastName || "User",
        email: orderData.email,
        phone_number: orderData.phoneNumber,
        amount: orderData.amount,
        currency: "KES",
        api_ref: orderData.orderId,
        host: process.env.FRONTEND_URL || "http://localhost:5173",
        redirect_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/checkout/success`,
      };

      console.log("📤 Sending to IntaSend:", paymentData);

      const response = await collection.charge(paymentData);

      console.log("📥 IntaSend Response:", response);

      return {
        success: true,
        url: response.url,
        invoiceId: response.invoice_id,
      };
    } catch (error) {
      console.error("❌ IntaSend checkout error:", error);
      return {
        success: false,
        message: error.message || "Payment initialization failed",
      };
    }
  }

  async checkStatus(invoiceId) {
    try {
      const collection = this.intasend.collection();
      const response = await collection.status(invoiceId);

      console.log(
        "🔍 Status check response:",
        JSON.stringify(response, null, 2),
      );

      // ✅ Handle different response formats
      const state =
        response.invoice?.state ||
        response.state ||
        response.status ||
        "UNKNOWN";
      const isComplete =
        state === "COMPLETE" || state === "completed" || state === "success";

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
      };
    }
  }
}

module.exports = new IntaSendService();
