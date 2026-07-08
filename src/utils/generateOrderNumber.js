const { v4: uuidv4 } = require("uuid");

/**
 * Generates a unique order number with a prefix and timestamp.
 * Format: WN + last 8 digits of timestamp + 4 digit random number
 * Example: WN123456781234
 */
const generateOrderNumber = () => {
  const prefix = "WN"; // Wellness
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${prefix}${timestamp}${random}`;
};

/**
 * Generates a short, alphanumeric string for quick references (e.g., Telegram notifications).
 * Length: 8 characters
 * Example: A1B2C3D4
 */
const generateShortOrderNumber = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

module.exports = {
  generateOrderNumber,
  generateShortOrderNumber,
};
