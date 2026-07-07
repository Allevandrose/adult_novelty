const Cart = require("../models/Cart");
const Product = require("../models/Product");

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate(
      "items.product",
    );

    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: [] });
    }

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching cart",
    });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart/items
// @access  Private
exports.addToCart = async (req, res) => {
  try {
    const { productId, quantity, selectedVariant } = req.body;

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Validate stock
    if (selectedVariant && selectedVariant.size) {
      const variant = product.variants.find(
        (v) =>
          v.size === selectedVariant.size && v.color === selectedVariant.color,
      );
      if (!variant || variant.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: "Insufficient stock for selected variant",
        });
      }
    } else if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock",
      });
    }

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    // Check if product with same variant already in cart
    const itemIndex = cart.items.findIndex((item) => {
      const sameProduct = item.product.toString() === productId;
      const sameVariant =
        selectedVariant && selectedVariant.size
          ? item.selectedVariant?.size === selectedVariant.size &&
            item.selectedVariant?.color === selectedVariant.color
          : !item.selectedVariant?.size;
      return sameProduct && sameVariant;
    });

    // Calculate price adjustment from variant
    let priceAdjustment = 0;
    if (selectedVariant && selectedVariant.size) {
      const variant = product.variants.find(
        (v) =>
          v.size === selectedVariant.size && v.color === selectedVariant.color,
      );
      if (variant && variant.price) {
        priceAdjustment = variant.price;
      }
    }

    if (itemIndex > -1) {
      // Update quantity
      cart.items[itemIndex].quantity += quantity;
    } else {
      // Add new item
      cart.items.push({
        product: productId,
        quantity,
        selectedVariant: {
          size: selectedVariant?.size || "",
          color: selectedVariant?.color || "",
          priceAdjustment,
        },
      });
    }

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error adding to cart",
    });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/items/:productId
// @access  Private
exports.updateCartItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, selectedVariant } = req.body;

    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Find item with matching product and variant
    const itemIndex = cart.items.findIndex((item) => {
      const sameProduct = item.product.toString() === productId;
      const sameVariant =
        selectedVariant && selectedVariant.size
          ? item.selectedVariant?.size === selectedVariant.size &&
            item.selectedVariant?.color === selectedVariant.color
          : !item.selectedVariant?.size;
      return sameProduct && sameVariant;
    });

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    if (quantity <= 0) {
      // Remove item
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("Update cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating cart",
    });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/items/:productId
// @access  Private
exports.removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const { selectedVariant } = req.body;

    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // ✅ FIXED: Correct filter logic - keep items that DON'T match
    // If selectedVariant is provided, match both product and variant
    // If no variant, just match product
    if (selectedVariant && selectedVariant.size) {
      // Remove specific variant
      cart.items = cart.items.filter((item) => {
        const sameProduct = item.product.toString() === productId;
        const sameVariant =
          item.selectedVariant?.size === selectedVariant.size &&
          item.selectedVariant?.color === selectedVariant.color;
        // Keep if NOT (same product AND same variant)
        return !(sameProduct && sameVariant);
      });
    } else {
      // Remove all instances of this product (no variant specified)
      cart.items = cart.items.filter(
        (item) => item.product.toString() !== productId,
      );
    }

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error removing from cart",
    });
  }
};

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
exports.clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error clearing cart",
    });
  }
};

// @desc    Sync cart from localStorage to database
// @route   POST /api/cart/sync
// @access  Private
exports.syncCart = async (req, res) => {
  try {
    const { items } = req.body;

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    // Merge items with variant support
    for (const localItem of items) {
      const existingIndex = cart.items.findIndex((item) => {
        const sameProduct = item.product.toString() === localItem.productId;
        const sameVariant =
          localItem.selectedVariant && localItem.selectedVariant.size
            ? item.selectedVariant?.size === localItem.selectedVariant.size &&
              item.selectedVariant?.color === localItem.selectedVariant.color
            : !item.selectedVariant?.size;
        return sameProduct && sameVariant;
      });

      if (existingIndex > -1) {
        // If product exists, add quantities
        cart.items[existingIndex].quantity += localItem.quantity;
      } else {
        // Add new item
        cart.items.push({
          product: localItem.productId,
          quantity: localItem.quantity,
          selectedVariant: localItem.selectedVariant || {},
        });
      }
    }

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error("Sync cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error syncing cart",
    });
  }
};
