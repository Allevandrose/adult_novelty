const Product = require("../models/Product");
const Category = require("../models/Category");
const slugify = require("../utils/generateSlug");
const fs = require("fs");
const path = require("path");

// Helper function to delete image files
const deleteImageFiles = (imagePaths) => {
  if (!imagePaths || !Array.isArray(imagePaths)) return;

  imagePaths.forEach((imgPath) => {
    try {
      // Remove leading slash if present
      const cleanPath = imgPath.startsWith("/") ? imgPath.slice(1) : imgPath;
      const fullPath = path.join(__dirname, "../../public", cleanPath);

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`Deleted image: ${fullPath}`);
      }
    } catch (e) {
      console.error(`Failed to delete image ${imgPath}:`, e.message);
    }
  });
};

// Get all products (public) with filtering
const getProducts = async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      search,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

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
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    let sortOption = {};
    if (sort === "price_asc") sortOption.price = 1;
    else if (sort === "price_desc") sortOption.price = -1;
    else if (sort === "newest") sortOption.createdAt = -1;
    else sortOption.name = 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await Product.find(query)
      .populate("category", "name slug")
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
      data: products,
    });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Get single product (public)
const getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      isActive: true,
    }).populate("category", "name slug");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Create product with image upload
const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, variants, stock, isFeatured } =
      req.body;

    if (!name || !description || !price || !category) {
      // Clean up uploaded files if validation fails
      if (req.files) {
        deleteImageFiles(
          req.files.map((f) => `/uploads/products/${f.filename}`),
        );
      }
      return res.status(400).json({
        success: false,
        message: "Name, description, price and category are required",
      });
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      // Clean up uploaded files
      if (req.files) {
        deleteImageFiles(
          req.files.map((f) => `/uploads/products/${f.filename}`),
        );
      }
      return res.status(400).json({
        success: false,
        message: "Category not found",
      });
    }

    const slug = slugify(name);
    const exists = await Product.findOne({ slug });
    if (exists) {
      // Clean up uploaded files
      if (req.files) {
        deleteImageFiles(
          req.files.map((f) => `/uploads/products/${f.filename}`),
        );
      }
      return res.status(400).json({
        success: false,
        message: "Product already exists",
      });
    }

    // Get uploaded image URLs
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map((file) => {
        return `/uploads/products/${file.filename}`;
      });
    }

    // Parse variants if sent as string
    let parsedVariants = [];
    if (variants) {
      try {
        parsedVariants =
          typeof variants === "string" ? JSON.parse(variants) : variants;
      } catch (e) {
        parsedVariants = [];
      }
    }

    // Clean variants
    const cleanedVariants =
      parsedVariants.length > 0
        ? parsedVariants
            .map((v) => ({
              size: v.size || "",
              color: v.color || "",
              stock: parseInt(v.stock) || 0,
              price: parseFloat(v.price) || 0,
            }))
            .filter((v) => v.color || v.size)
        : [];

    const productData = {
      name,
      slug,
      description,
      price: parseFloat(price),
      category,
      images: imageUrls,
      variants: cleanedVariants,
      stock: cleanedVariants.length > 0 ? 0 : parseInt(stock) || 0,
      isFeatured: isFeatured === "true" || isFeatured === true || false,
    };

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Create product error:", error);
    // Clean up uploaded files on error
    if (req.files) {
      deleteImageFiles(req.files.map((f) => `/uploads/products/${f.filename}`));
    }
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Update product with image upload
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const {
      name,
      description,
      price,
      category,
      variants,
      stock,
      isActive,
      isFeatured,
      removeImages,
    } = req.body;

    // Handle image uploads
    let imageUrls = product.images || [];
    let imagesToRemove = [];

    // Parse removeImages if sent
    if (removeImages) {
      try {
        imagesToRemove =
          typeof removeImages === "string"
            ? JSON.parse(removeImages)
            : removeImages;
      } catch (e) {
        imagesToRemove = [];
      }
    }

    // Remove images from array and delete files
    if (imagesToRemove && imagesToRemove.length > 0) {
      // Delete files from server
      deleteImageFiles(imagesToRemove);

      // Remove from imageUrls array
      imageUrls = imageUrls.filter((img) => !imagesToRemove.includes(img));
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(
        (file) => `/uploads/products/${file.filename}`,
      );
      imageUrls = [...imageUrls, ...newImages];
    }

    // Update fields
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
          message: "Category not found",
        });
      }
      product.category = category;
    }
    if (imageUrls.length > 0) {
      product.images = imageUrls;
    } else {
      product.images = [];
    }

    if (variants) {
      try {
        const parsedVariants =
          typeof variants === "string" ? JSON.parse(variants) : variants;
        const cleanedVariants = parsedVariants
          .map((v) => ({
            size: v.size || "",
            color: v.color || "",
            stock: parseInt(v.stock) || 0,
            price: parseFloat(v.price) || 0,
          }))
          .filter((v) => v.color || v.size);
        product.variants = cleanedVariants;
        product.stock = cleanedVariants.length > 0 ? 0 : parseInt(stock) || 0;
      } catch (e) {
        console.error("Error parsing variants:", e);
      }
    }

    if (
      stock !== undefined &&
      (!product.variants || product.variants.length === 0)
    ) {
      product.stock = parseInt(stock) || 0;
    }

    if (isActive !== undefined)
      product.isActive = isActive === "true" || isActive === true;
    if (isFeatured !== undefined)
      product.isFeatured = isFeatured === "true" || isFeatured === true;

    await product.save();

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error("Update product error:", error);
    // Clean up newly uploaded files on error
    if (req.files) {
      deleteImageFiles(req.files.map((f) => `/uploads/products/${f.filename}`));
    }
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Delete product (admin only - hard delete with image cleanup)
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Delete associated images from server
    if (product.images && product.images.length > 0) {
      deleteImageFiles(product.images);
    }

    // Hard delete from database
    await product.deleteOne();

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
};
