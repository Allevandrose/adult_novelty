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
    // ✅ FIX: Check if user exists on req
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const { productId, quantity, selectedVariant } = req.body;

    // ✅ Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ✅ Validate stock BEFORE adding to cart
    if (selectedVariant && selectedVariant.size) {
      const variant = product.variants.find(
        (v) =>
          v.size === selectedVariant.size && v.color === selectedVariant.color,
      );

      if (!variant) {
        return res.status(400).json({
          success: false,
          message: `Variant ${selectedVariant.color} ${selectedVariant.size} not found for this product`,
        });
      }

      if (variant.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name} - ${selectedVariant.color} ${selectedVariant.size}. Available: ${variant.stock}`,
        });
      }
    } else {
      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
        });
      }
    }

    // ✅ Fetch or create cart
    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

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

    // Check if item already exists in cart
    const itemIndex = cart.items.findIndex((item) => {
      const sameProduct = item.product.toString() === productId;
      const sameVariant =
        selectedVariant && selectedVariant.size
          ? item.selectedVariant?.size === selectedVariant.size &&
            item.selectedVariant?.color === selectedVariant.color
          : !item.selectedVariant?.size;
      return sameProduct && sameVariant;
    });

    if (itemIndex > -1) {
      const newQuantity = cart.items[itemIndex].quantity + quantity;

      if (selectedVariant && selectedVariant.size) {
        const variant = product.variants.find(
          (v) =>
            v.size === selectedVariant.size &&
            v.color === selectedVariant.color,
        );
        if (variant && variant.stock < newQuantity) {
          return res.status(400).json({
            success: false,
            message: `Cannot add more. Only ${variant.stock} available in stock. You already have ${cart.items[itemIndex].quantity} in cart.`,
          });
        }
      } else {
        if (product.stock < newQuantity) {
          return res.status(400).json({
            success: false,
            message: `Cannot add more. Only ${product.stock} available in stock. You already have ${cart.items[itemIndex].quantity} in cart.`,
          });
        }
      }

      cart.items[itemIndex].quantity = newQuantity;
    } else {
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

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

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

    if (quantity > 0) {
      if (selectedVariant && selectedVariant.size) {
        const variant = product.variants.find(
          (v) =>
            v.size === selectedVariant.size &&
            v.color === selectedVariant.color,
        );
        if (variant && variant.stock < quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock. Only ${variant.stock} available.`,
          });
        }
      } else {
        if (product.stock < quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock. Only ${product.stock} available.`,
          });
        }
      }
    }

    if (quantity <= 0) {
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

    if (selectedVariant && selectedVariant.size) {
      cart.items = cart.items.filter((item) => {
        const sameProduct = item.product.toString() === productId;
        const sameVariant =
          item.selectedVariant?.size === selectedVariant.size &&
          item.selectedVariant?.color === selectedVariant.color;
        return !(sameProduct && sameVariant);
      });
    } else {
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
        cart.items[existingIndex].quantity += localItem.quantity;
      } else {
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
