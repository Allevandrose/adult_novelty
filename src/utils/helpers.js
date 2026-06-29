const crypto = require("crypto");

// Generate random string
const generateRandomString = (length = 10) => {
  return crypto.randomBytes(length).toString("hex");
};

// Format currency (KES)
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Sanitize phone number (Kenya)
const sanitizePhoneNumber = (phone) => {
  let cleaned = phone.replace(/[^0-9+]/g, "");

  // If starts with 0, replace with 254
  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.substring(1);
  }

  // If starts with 254, keep as is
  if (cleaned.startsWith("254")) {
    return cleaned;
  }

  // If starts with +254, remove +
  if (cleaned.startsWith("+254")) {
    return cleaned.substring(1);
  }

  return cleaned;
};

// Validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Pagination helper
const paginate = (page = 1, limit = 10) => {
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  return {
    skip,
    limit: limitNum,
    page: pageNum,
  };
};

// Get discreet description for billing
const getDiscreetDescription = (orderNumber) => {
  const descriptions = [
    `Wellness Products Retail - Order #${orderNumber}`,
    `Health & Wellness Supply - #${orderNumber}`,
    `Personal Care Products - #${orderNumber}`,
  ];
  return descriptions[Math.floor(Math.random() * descriptions.length)];
};

// Calculate order total
const calculateOrderTotal = (items) => {
  return items.reduce((total, item) => {
    return total + item.price * item.quantity;
  }, 0);
};

module.exports = {
  generateRandomString,
  formatCurrency,
  sanitizePhoneNumber,
  isValidEmail,
  paginate,
  getDiscreetDescription,
  calculateOrderTotal,
};
