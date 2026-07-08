const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    images: [
      {
        type: String,
        // ✅ NO VALIDATION - Accepts any string (local paths, Cloudinary URLs, external URLs)
      },
    ],
    variants: [
      {
        size: {
          type: String,
          enum: ["XS", "S", "M", "L", "XL", "XXL", ""],
          default: "",
        },
        color: {
          type: String,
          default: "",
        },
        stock: {
          type: Number,
          default: 0,
          min: 0,
        },
        price: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Virtual for total stock
productSchema.virtual("totalStock").get(function () {
  if (this.variants && this.variants.length > 0) {
    return this.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
  }
  return this.stock || 0;
});

// Helper method to check if image is from Cloudinary
productSchema.methods.isCloudinaryImage = function (imageUrl) {
  return imageUrl && imageUrl.includes("cloudinary.com");
};

// Helper method to get optimized Cloudinary URL
productSchema.methods.getOptimizedImage = function (imageUrl, size = "medium") {
  if (!imageUrl) return null;
  if (!this.isCloudinaryImage(imageUrl)) return imageUrl;

  const sizes = {
    thumbnail: "w_150,h_150,c_thumb,q_auto,f_auto",
    small: "w_200,h_200,c_limit,q_auto,f_auto",
    medium: "w_400,h_400,c_limit,q_auto,f_auto",
    large: "w_800,h_800,c_limit,q_auto,f_auto",
  };

  const parts = imageUrl.split("/upload/");
  if (parts.length === 2 && sizes[size]) {
    return `${parts[0]}/upload/${sizes[size]}/${parts[1]}`;
  }
  return imageUrl;
};

// Add virtual for image optimization (updated to safely handle non-Cloudinary images)
productSchema.virtual("optimizedImages").get(function () {
  if (!this.images || this.images.length === 0) return [];

  return this.images.map((url) => {
    // If it's a local path or an external URL, just return it as original
    if (!url || !url.includes("cloudinary.com")) {
      return { original: url };
    }

    // Add transformations for different sizes ONLY if it is a Cloudinary URL
    const baseUrl = url.split("/upload/");
    if (baseUrl.length === 2) {
      return {
        original: url,
        thumbnail: `${baseUrl[0]}/upload/w_150,h_150,c_thumb,q_auto,f_auto/${baseUrl[1]}`,
        small: `${baseUrl[0]}/upload/w_200,h_200,c_limit,q_auto,f_auto/${baseUrl[1]}`,
        medium: `${baseUrl[0]}/upload/w_400,h_400,c_limit,q_auto,f_auto/${baseUrl[1]}`,
        large: `${baseUrl[0]}/upload/w_800,h_800,c_limit,q_auto,f_auto/${baseUrl[1]}`,
      };
    }
    return { original: url };
  });
});

// Ensure virtuals are included in JSON output
productSchema.set("toJSON", { virtuals: true });
productSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Product", productSchema);
