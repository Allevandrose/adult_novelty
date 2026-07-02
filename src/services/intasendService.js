const IntaSend = require('intasend-node');

class IntaSendService {
  constructor() {
    // Get credentials from .env
    this.publishableKey = process.env.INTASEND_PUBLISHABLE_KEY;
    this.secretKey = process.env.INTASEND_SECRET_KEY;
    this.isTest = process.env.INTASEND_ENVIRONMENT === 'test';
    
    // Initialize IntaSend
    this.intasend = new IntaSend(
      this.publishableKey,
      this.secretKey,
      this.isTest
    );
  }

  // Create a payment checkout link
  async createCheckout(orderData) {
    try {
      const collection = this.intasend.collection();
      
      // Prepare payment data
      const paymentData = {
        first_name: orderData.firstName || 'Customer',
        last_name: orderData.lastName || 'User',
        email: orderData.email,
        phone_number: orderData.phoneNumber, // Format: 2547XXXXXXXX
        amount: orderData.amount,
        currency: 'KES',
        api_ref: orderData.orderId, // Your internal order ID
        host: process.env.FRONTEND_URL || 'http://localhost:3000',
        redirect_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/success`
      };

      console.log('Sending to IntaSend:', paymentData);

      const response = await collection.charge(paymentData);

      return {
        success: true,
        url: response.url,        // Payment page URL
        invoiceId: response.invoice_id // IntaSend invoice ID
      };
    } catch (error) {
      console.error('IntaSend checkout error:', error);
      return {
        success: false,
        message: error.message || 'Payment initialization failed'
      };
    }
  }

  // Check payment status
  async checkStatus(invoiceId) {
    try {
      const collection = this.intasend.collection();
      const response = await collection.status(invoiceId);
      
      return {
        success: true,
        status: response.invoice.state, // 'COMPLETE', 'PENDING', 'FAILED'
        data: response
      };
    } catch (error) {
      console.error('IntaSend status check error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

module.exports = new IntaSendService();
