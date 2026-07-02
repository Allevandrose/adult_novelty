const Order = require('../models/Order');
const intaSendService = require('../services/intasendService');

// Initiate payment for an order
const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    // Validate orderId
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Find the order
    const order = await Order.findById(orderId).populate('user', 'email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns this order
    if (order.user._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pay for this order'
      });
    }

    // Check if order is already paid
    if (order.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    // Prepare payment data for IntaSend
    const paymentData = {
      orderId: order.orderNumber,
      amount: order.totalAmount,
      email: order.user.email,
      phoneNumber: order.shippingAddress.phone,
      firstName: order.user.email.split('@')[0] || 'Customer',
      lastName: 'User'
    };

    // Create IntaSend checkout
    const result = await intaSendService.createCheckout(paymentData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Failed to initiate payment'
      });
    }

    // Save IntaSend invoice ID to order
    order.payment = {
      method: 'mpesa',
      pesapalOrderId: result.invoiceId,
      paymentStatus: 'pending'
    };
    await order.save();

    // Return payment URL to frontend
    res.json({
      success: true,
      data: {
        paymentUrl: result.url,
        invoiceId: result.invoiceId,
        orderId: order._id
      }
    });
  } catch (error) {
    console.error('Initiate payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Handle IntaSend webhook
const handleWebhook = async (req, res) => {
  try {
    // IntaSend sends webhook data in the body
    const { invoice_id, state, api_ref, challenge } = req.body;

    // IntaSend sometimes sends a challenge to verify the endpoint
    if (challenge) {
      console.log('Webhook challenge received:', challenge);
      return res.status(200).json({ challenge });
    }

    // Respond immediately to prevent retries
    res.status(200).send('OK');

    console.log('Webhook received:', { invoice_id, state, api_ref });

    // Only process if payment is complete
    if (state === 'COMPLETE') {
      // Verify the payment status with IntaSend
      const statusCheck = await intaSendService.checkStatus(invoice_id);

      if (!statusCheck.success) {
        console.error('Failed to verify payment status:', statusCheck.message);
        return;
      }

      if (statusCheck.status === 'COMPLETE') {
        // Find order by order number
        const order = await Order.findOne({ orderNumber: api_ref });
        if (!order) {
          console.error('Order not found:', api_ref);
          return;
        }

        // Check if order is already marked as paid
        if (order.status === 'paid') {
          console.log('Order already paid:', api_ref);
          return;
        }

        // Update order status
        order.status = 'paid';
        order.payment.paymentStatus = 'completed';
        order.payment.paidAt = new Date();
        
        // Add to timeline
        order.timeline.push({
          status: 'paid',
          note: 'Payment confirmed via IntaSend'
        });

        await order.save();

        console.log(`✅ Order ${api_ref} marked as paid`);

        // TODO: Send confirmation email
        // TODO: Generate invoice PDF
        // TODO: Send Telegram notification

      } else {
        console.log(`Payment not complete: ${state}`);
      }
    } else {
      console.log(`Payment state: ${state}`);
    }
  } catch (error) {
    console.error('Webhook error:', error);
  }
};

// Check payment status (frontend can poll this)
const checkPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: {
        status: order.status,
        paymentStatus: order.payment.paymentStatus,
        paidAt: order.payment.paidAt
      }
    });
  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  initiatePayment,
  handleWebhook,
  checkPaymentStatus
};
