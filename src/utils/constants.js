// Order statuses
const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  PAID: "paid",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

// Payment methods
const PAYMENT_METHODS = {
  MPESA: "mpesa",
  AIRTEL: "airtel",
  CARD: "card",
};

// Payment statuses
const PAYMENT_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  REFUNDED: "refunded",
};

// User roles
const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
};

// Product variant sizes
const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

// Product categories (default)
const DEFAULT_CATEGORIES = [
  "Vibrators",
  "Dildos",
  "Couples Toys",
  "Lingerie",
  "BDSM Accessories",
  "Lubricants",
  "Male Toys",
  "Anal Toys",
  "Wearables",
];

// Discreet billing descriptions
const DISCREET_DESCRIPTIONS = [
  "Wellness Products Retail - Order #",
  "Health & Wellness Supply - #",
  "Personal Care Products - #",
];

// Cloudinary configuration
const CLOUDINARY_CONFIG = {
  CLOUD_NAME: "gnxupkp2",
  API_KEY: "778938248943598",
  API_SECRET: "vm3Da002_qkziH-2_BNGAJElCKw",
  UPLOAD_FOLDER: "adult-novelty/products",
  ALLOWED_FORMATS: ["jpg", "jpeg", "png", "webp", "gif"],
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_FILES: 5,
  TRANSFORMATIONS: {
    THUMBNAIL: { width: 150, height: 150, crop: "thumb" },
    SMALL: { width: 200, height: 200, crop: "limit" },
    MEDIUM: { width: 400, height: 400, crop: "limit" },
    LARGE: { width: 800, height: 800, crop: "limit" },
  },
};

module.exports = {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  USER_ROLES,
  SIZES,
  DEFAULT_CATEGORIES,
  DISCREET_DESCRIPTIONS,
  CLOUDINARY_CONFIG,
};
