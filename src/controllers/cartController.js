const Cart = require("../models/Cart");
const Product = require("../models/Product");
const logger = require("../utils/logger");

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
exports.getCart = async (req, res) => {
  try {
    // ✅ Use findOneAndUpdate with upsert for atomic operation
    const cart = await Cart.findOneAndUpdate(
      { user: req.user.id },
      {
        $setOnInsert: {
          user: req.user.id,
          items: [],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).populate("items.product");

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    logger.error("Get cart error:", error);
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
    // ✅ Verify user authentication
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const { productId, quantity = 1, selectedVariant } = req.body;

    // ✅ Validate productId
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // ✅ Validate product exists and is active
    const product = await Product.findOne({
      _id: productId,
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or unavailable",
      });
    }

    // ✅ Determine price and validate stock
    let priceAtAdd = product.price;

    if (selectedVariant?.size) {
      const variant = product.variants.find(
        (v) =>
          v.size === selectedVariant.size && v.color === selectedVariant.color,
      );

      if (!variant) {
        return res.status(400).json({
          success: false,
          message: `Variant ${selectedVariant.color || ""} ${selectedVariant.size} not found`,
        });
      }

      if (variant.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Available: ${variant.stock}`,
        });
      }

      priceAtAdd = variant.price || product.price;
    } else {
      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock. Available: ${product.stock}`,
        });
      }
    }

    // ✅ Atomic operation: find cart or create if doesn't exist
    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = await Cart.findOneAndUpdate(
        { user: req.user.id },
        {
          $setOnInsert: {
            user: req.user.id,
            items: [],
          },
        },
        { upsert: true, new: true },
      );
    }

    // ✅ Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex((item) => {
      const sameProduct = item.product.toString() === productId;
      const sameVariant = selectedVariant?.size
        ? item.selectedVariant?.size === selectedVariant.size &&
          item.selectedVariant?.color === selectedVariant.color
        : !item.selectedVariant?.size;
      return sameProduct && sameVariant;
    });

    if (existingItemIndex > -1) {
      // Update quantity of existing item
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;

      // Revalidate stock for new quantity
      if (selectedVariant?.size) {
        const variant = product.variants.find(
          (v) =>
            v.size === selectedVariant.size &&
            v.color === selectedVariant.color,
        );
        if (variant && variant.stock < newQuantity) {
          return res.status(400).json({
            success: false,
            message: `Cannot add more. Available: ${variant.stock}, In cart: ${cart.items[existingItemIndex].quantity}`,
          });
        }
      } else {
        if (product.stock < newQuantity) {
          return res.status(400).json({
            success: false,
            message: `Cannot add more. Available: ${product.stock}, In cart: ${cart.items[existingItemIndex].quantity}`,
          });
        }
      }

      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].priceAtAdd = priceAtAdd;
    } else {
      // Add new item to cart
      cart.items.push({
        product: productId,
        quantity,
        selectedVariant: {
          size: selectedVariant?.size || "",
          color: selectedVariant?.color || "",
          priceAdjustment: selectedVariant?.size
            ? priceAtAdd - product.price
            : 0,
        },
        priceAtAdd,
      });
    }

    // ✅ Reset expiration on cart update
    cart.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      message: existingItemIndex > -1 ? "Cart updated" : "Item added to cart",
      data: cart,
    });
  } catch (error) {
    logger.error("Add to cart error:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Cart conflict. Please refresh and try again.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error adding to cart",
    });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/items/:itemId
// @access  Private
exports.updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid quantity is required",
      });
    }

    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // ✅ Find item by its subdocument _id
    const item = cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    // ✅ Validate stock before updating
    if (quantity > 0) {
      const product = await Product.findById(item.product);

      if (product) {
        if (item.selectedVariant?.size) {
          const variant = product.variants.find(
            (v) =>
              v.size === item.selectedVariant.size &&
              v.color === item.selectedVariant.color,
          );
          if (variant && variant.stock < quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock. Available: ${variant.stock}`,
            });
          }
        } else {
          if (product.stock < quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock. Available: ${product.stock}`,
            });
          }
        }
      }
    }

    // ✅ Remove item if quantity is 0
    if (quantity === 0) {
      cart.items.pull(itemId);
    } else {
      item.quantity = quantity;
    }

    // ✅ Reset expiration
    cart.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      message: quantity === 0 ? "Item removed from cart" : "Cart updated",
      data: cart,
    });
  } catch (error) {
    logger.error("Update cart item error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating cart",
    });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/items/:itemId
// @access  Private
exports.removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;

    const cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // ✅ Use Mongoose pull method for subdocument removal
    const item = cart.items.id(itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    cart.items.pull(itemId);

    // ✅ Reset expiration
    cart.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      message: "Item removed from cart",
      data: cart,
    });
  } catch (error) {
    logger.error("Remove from cart error:", error);
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
    const cart = await Cart.findOneAndUpdate(
      { user: req.user.id },
      {
        $set: {
          items: [],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true },
    );

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    res.json({
      success: true,
      message: "Cart cleared",
      data: cart,
    });
  } catch (error) {
    logger.error("Clear cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error clearing cart",
    });
  }
};

// @desc    Sync cart from localStorage to database (for guest users logging in)
// @route   POST /api/cart/sync
// @access  Private
exports.syncCart = async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items array is required",
      });
    }

    // ✅ Validate each item
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Each item must have a valid productId and quantity",
        });
      }
    }

    let cart = await Cart.findOne({ user: req.user.id });

    if (!cart) {
      cart = await Cart.findOneAndUpdate(
        { user: req.user.id },
        { $setOnInsert: { user: req.user.id, items: [] } },
        { upsert: true, new: true },
      );
    }

    // ✅ Process each item from localStorage
    for (const localItem of items) {
      // Verify product exists
      const product = await Product.findById(localItem.productId);
      if (!product) continue; // Skip invalid products

      // Determine price
      let priceAtAdd = product.price;
      if (localItem.selectedVariant?.size) {
        const variant = product.variants.find(
          (v) =>
            v.size === localItem.selectedVariant.size &&
            v.color === localItem.selectedVariant.color,
        );
        if (variant) {
          priceAtAdd = variant.price || product.price;
        }
      }

      // Check if item already exists
      const existingIndex = cart.items.findIndex((item) => {
        const sameProduct = item.product.toString() === localItem.productId;
        const sameVariant = localItem.selectedVariant?.size
          ? item.selectedVariant?.size === localItem.selectedVariant.size &&
            item.selectedVariant?.color === localItem.selectedVariant.color
          : !item.selectedVariant?.size;
        return sameProduct && sameVariant;
      });

      if (existingIndex > -1) {
        // Merge quantities
        cart.items[existingIndex].quantity += localItem.quantity;
        cart.items[existingIndex].priceAtAdd = priceAtAdd;
      } else {
        // Add new item
        cart.items.push({
          product: localItem.productId,
          quantity: localItem.quantity,
          selectedVariant: localItem.selectedVariant || {},
          priceAtAdd,
        });
      }
    }

    // ✅ Reset expiration
    cart.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await cart.save();
    await cart.populate("items.product");

    res.json({
      success: true,
      message: "Cart synced successfully",
      data: cart,
    });
  } catch (error) {
    logger.error("Sync cart error:", error);
    res.status(500).json({
      success: false,
      message: "Error syncing cart",
    });
  }
};
