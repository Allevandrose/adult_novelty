const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const auth = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');

// Public routes
router.get('/', getProducts);
router.get('/:slug', getProduct);

// Admin only routes with image upload
router.post('/', auth, uploadMultiple, createProduct);
router.put('/:id', auth, uploadMultiple, updateProduct);
router.delete('/:id', auth, deleteProduct);

module.exports = router;
