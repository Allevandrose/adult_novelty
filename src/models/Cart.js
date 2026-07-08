const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
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
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: [cartItemSchema],
    // ✅ Add expiration for abandoned carts
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      index: { expires: 0 }, // ✅ MongoDB TTL index - auto-delete after 30 days
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Add explicit index for user lookups
cartSchema.index({ user: 1 });

// ✅ Virtual for cart total
cartSchema.virtual("totalItems").get(function () {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// ✅ Method to calculate cart total
cartSchema.methods.calculateTotal = async function () {
  await this.populate("items.product");
  let total = 0;
  for (const item of this.items) {
    const price = item.selectedVariant?.priceAdjustment || item.product.price;
    total += price * item.quantity;
  }
  return total;
};

// Ensure virtuals are included
cartSchema.set("toJSON", { virtuals: true });
cartSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Cart", cartSchema);
