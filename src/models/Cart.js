const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: [true, "Product ID is required"],
  },
  quantity: {
    type: Number,
    required: [true, "Quantity is required"],
    min: [1, "Quantity must be at least 1"],
    default: 1,
  },
  selectedVariant: {
    size: {
      type: String,
      default: "",
    },
    color: {
      type: String,
      default: "",
    },
    priceAdjustment: {
      type: Number,
      default: 0,
    },
  },
  // ✅ Store price at time of adding to cart (prevents price changes affecting cart)
  priceAtAdd: {
    type: Number,
    required: true,
    min: 0,
  },
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      unique: true,
      index: true,
    },
    items: [cartItemSchema],
    // ✅ Cart expiration for abandoned carts
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  },
  {
    timestamps: true,
  },
);

// ✅ TTL Index - MongoDB auto-deletes expired carts
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// ✅ Index for user lookups
cartSchema.index({ user: 1 });
// ✅ Compound index for common queries
cartSchema.index({ user: 1, updatedAt: -1 });

// ✅ Virtual for cart total items count
cartSchema.virtual("totalItems").get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// ✅ Virtual for cart subtotal
cartSchema.virtual("subtotal").get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((sum, item) => {
    return sum + item.priceAtAdd * item.quantity;
  }, 0);
});

// ✅ Method to recalculate all prices (call before checkout)
cartSchema.methods.recalculatePrices = async function () {
  await this.populate("items.product");

  for (const item of this.items) {
    if (item.product) {
      // Use variant price if exists, otherwise use product price
      if (item.selectedVariant?.size && item.product.variants?.length > 0) {
        const variant = item.product.variants.find(
          (v) =>
            v.size === item.selectedVariant.size &&
            v.color === item.selectedVariant.color,
        );
        item.priceAtAdd = variant?.price || item.product.price;
      } else {
        item.priceAtAdd = item.product.price;
      }
    }
  }

  await this.save();
  return this;
};

// Ensure virtuals are included in JSON output
cartSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    return ret;
  },
});

cartSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Cart", cartSchema);
