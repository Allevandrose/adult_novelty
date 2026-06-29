const express = require('express');
const router = express.Router();
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const auth = require('../middleware/auth');

// Public routes
router.get('/', getCategories);
router.get('/:slug', getCategory);

// Admin only routes
router.post('/', auth, createCategory);
router.put('/:id', auth, updateCategory);
router.delete('/:id', auth, deleteCategory);

module.exports = router;
