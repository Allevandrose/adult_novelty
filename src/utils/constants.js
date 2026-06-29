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

module.exports = {
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  USER_ROLES,
  SIZES,
  DEFAULT_CATEGORIES,
  DISCREET_DESCRIPTIONS,
};
