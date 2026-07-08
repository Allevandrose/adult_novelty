const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true, // ✅ Add index
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true, // ✅ Add index
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true, // ✅ Add index
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Compound index for active categories
categorySchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model("Category", categorySchema);
