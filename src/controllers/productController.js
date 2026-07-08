const Product = require("../models/Product");
const Category = require("../models/Category");
const slugify = require("../utils/generateSlug");
const CloudinaryService = require("../services/cloudinaryService");
const logger = require("../utils/logger");

// ✅ Import Redis cache (optional)
let getCache = null;
let setCache = null;
let deleteCache = null;
try {
  const redis = require("../config/redis");
  getCache = redis.getCache;
  setCache = redis.setCache;
  deleteCache = redis.deleteCache;
} catch (e) {
  getCache = async () => null;
  setCache = async () => {};
  deleteCache = async () => {};
}

// Helper function to delete images from Cloudinary
const deleteCloudinaryImages = async (imageUrls) => {
  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return;
  }

  try {
    const results = await CloudinaryService.deleteImages(imageUrls);
    logger.info("Cloudinary delete results:", results);
  } catch (error) {
    logger.error("Error deleting from Cloudinary:", error);
  }
};

// ✅ Get all products (public) with caching
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

    // ✅ Build cache key
    const cacheKey = `products:${category || "all"}:${minPrice || "0"}:${maxPrice || "max"}:${search || "none"}:${sort || "name"}:${page}:${limit}`;

    // ✅ Try cache first
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json({
        success: true,
        ...cachedData,
        fromCache: true,
      });
    }

    const query = { isActive: true };

    // ✅ Use text search instead of regex for better performance
    if (search) {
      query.$text = { $search: search };
    }

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

    let sortOption = {};
    if (sort === "price_asc") sortOption.price = 1;
    else if (sort === "price_desc") sortOption.price = -1;
    else if (sort === "newest") sortOption.createdAt = -1;
    else if (sort === "featured") sortOption.isFeatured = -1;
    else sortOption.name = 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ✅ Use lean() for better performance
    const products = await Product.find(query)
      .populate("category", "name slug")
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments(query);

    const response = {
      count: products.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: products,
    };

    // ✅ Cache for 5 minutes
    await setCache(cacheKey, response, 300);

    res.json({
      success: true,
      ...response,
      fromCache: false,
    });
  } catch (error) {
    logger.error("Get products error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// ✅ Get single product with caching
const getProduct = async (req, res) => {
  try {
    const { slug } = req.params;

    // ✅ Try cache
    const cacheKey = `product:${slug}`;
    const cachedProduct = await getCache(cacheKey);
    if (cachedProduct) {
      return res.json({
        success: true,
        data: cachedProduct,
        fromCache: true,
      });
    }

    const product = await Product.findOne({
      slug,
      isActive: true,
    })
      .populate("category", "name slug")
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ✅ Cache for 1 hour
    await setCache(cacheKey, product, 3600);

    res.json({
      success: true,
      data: product,
      fromCache: false,
    });
  } catch (error) {
    logger.error("Get product error:", error);
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
      if (req.files) {
        await deleteCloudinaryImages(req.files.map((f) => f.path));
      }
      return res.status(400).json({
        success: false,
        message: "Name, description, price and category are required",
      });
    }

    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      if (req.files) {
        await deleteCloudinaryImages(req.files.map((f) => f.path));
      }
      return res.status(400).json({
        success: false,
        message: "Category not found",
      });
    }

    const slug = slugify(name);
    const exists = await Product.findOne({ slug });
    if (exists) {
      if (req.files) {
        await deleteCloudinaryImages(req.files.map((f) => f.path));
      }
      return res.status(400).json({
        success: false,
        message: "Product already exists",
      });
    }

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = req.files.map((file) => file.path);
    }

    let parsedVariants = [];
    if (variants) {
      try {
        parsedVariants =
          typeof variants === "string" ? JSON.parse(variants) : variants;
      } catch (e) {
        parsedVariants = [];
      }
    }

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

    // ✅ Invalidate product cache
    await deleteCache(`products:*`);

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error("Create product error:", error);
    if (req.files) {
      await deleteCloudinaryImages(req.files.map((f) => f.path));
    }
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Update product
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

    let imageUrls = product.images || [];
    let imagesToRemove = [];

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

    if (imagesToRemove && imagesToRemove.length > 0) {
      await deleteCloudinaryImages(imagesToRemove);
      imageUrls = imageUrls.filter((img) => !imagesToRemove.includes(img));
    }

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file) => file.path);
      imageUrls = [...imageUrls, ...newImages];
    }

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
        logger.error("Error parsing variants:", e);
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

    // ✅ Invalidate product cache
    await deleteCache(`product:${product.slug}`);
    await deleteCache(`products:*`);

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error("Update product error:", error);
    if (req.files) {
      await deleteCloudinaryImages(req.files.map((f) => f.path));
    }
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.images && product.images.length > 0) {
      await deleteCloudinaryImages(product.images);
    }

    await product.deleteOne();

    // ✅ Invalidate product cache
    await deleteCache(`product:${product.slug}`);
    await deleteCache(`products:*`);

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    logger.error("Delete product error:", error);
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
