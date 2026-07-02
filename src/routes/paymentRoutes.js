const express = require('express');
const router = express.Router();
const {
  initiatePayment,
  handleWebhook,
  checkPaymentStatus
} = require('../controllers/paymentController');
const auth = require('../middleware/auth');

// Public webhook (IntaSend calls this)
router.post('/webhook', handleWebhook);

// Protected routes (require login)
router.post('/initiate', auth, initiatePayment);
router.get('/status/:orderId', auth, checkPaymentStatus);

module.exports = router;
