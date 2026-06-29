const { v4: uuidv4 } = require("uuid");

const generateOrderNumber = () => {
  const prefix = "WN"; // Wellness
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}${timestamp}${random}`;
};

// Alternative: short order number (for Telegram)
const generateShortOrderNumber = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

module.exports = { generateOrderNumber, generateShortOrderNumber };
