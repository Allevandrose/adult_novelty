const express = require('express');
const router = express.Router();

// Placeholder routes - will be implemented later
router.get('/test', (req, res) => {
  res.json({ message: 'Product routes working' });
});

module.exports = router;
