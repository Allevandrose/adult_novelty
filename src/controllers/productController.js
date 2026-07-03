const Product = require('../models/Product');
const Category = require('../models/Category');
const slugify = require('../utils/generateSlug');

// Get all products (public) with filtering
const getProducts = async (req, res) => {
  try {
    const { category, minPrice, maxPrice, search, sort, page = 1, limit = 20 } = req.query;
    
    const query = { isActive: true };
    
    if (category) {
      const categoryDoc = await Category.findOne({ slug: category });
      if (categoryDoc) {
        query.category = categoryDoc._id;
      }
    }
    
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    let sortOption = {};
    if (sort === 'price_asc') sortOption.price = 1;
    else if (sort === 'price_desc') sortOption.price = -1;
    else if (sort === 'newest') sortOption.createdAt = -1;
    else sortOption.name = 1;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Product.countDocuments(query);
    
    res.json({
      success: true,
      count: products.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: products
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get single product (public)
const getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ 
      slug: req.params.slug,
      isActive: true 
    }).populate('category', 'name slug');
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create product (admin only)
const createProduct = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      price, 
      category, 
      images, 
      variants, 
      stock, 
      isFeatured 
    } = req.body;

    if (!name || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, price and category are required'
      });
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Category not found'
      });
    }

    const slug = slugify(name);
    const exists = await Product.findOne({ slug });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Product already exists'
      });
    }

    // Clean variants - remove empty values and ensure proper structure
    const cleanedVariants = variants && variants.length > 0 
      ? variants.map(v => ({
          size: v.size || '',
          color: v.color || '',
          stock: parseInt(v.stock) || 0,
          price: parseFloat(v.price) || 0
        })).filter(v => v.color || v.size) // Keep only if has color or size
      : [];

    const productData = {
      name,
      slug,
      description,
      price: parseFloat(price),
      category,
      images: images || [],
      variants: cleanedVariants,
      stock: cleanedVariants.length > 0 ? 0 : parseInt(stock) || 0,
      isFeatured: isFeatured || false
    };

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

// Update product (admin only)
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { 
      name, 
      description, 
      price, 
      category, 
      images, 
      variants, 
      stock, 
      isActive,
      isFeatured 
    } = req.body;

    if (name) {
      product.name = name;
      product.slug = slugify(name);
    }
    if (description) product.description = description;
    if (price) product.price = parseFloat(price);
    if (category) {
      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: 'Category not found'
        });
      }
      product.category = category;
    }
    if (images) product.images = images;
    
    if (variants) {
      const cleanedVariants = variants.map(v => ({
        size: v.size || '',
        color: v.color || '',
        stock: parseInt(v.stock) || 0,
        price: parseFloat(v.price) || 0
      })).filter(v => v.color || v.size);
      product.variants = cleanedVariants;
      product.stock = cleanedVariants.length > 0 ? 0 : parseInt(stock) || 0;
    }
    
    if (stock !== undefined && (!product.variants || product.variants.length === 0)) {
      product.stock = parseInt(stock) || 0;
    }
    
    if (isActive !== undefined) product.isActive = isActive;
    if (isFeatured !== undefined) product.isFeatured = isFeatured;

    await product.save();

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
};

// Delete product (admin only - soft delete)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    product.isActive = false;
    await product.save();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct
};
