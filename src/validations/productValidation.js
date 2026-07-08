const Joi = require("joi");

// Validation for creating a product
const createProductValidation = Joi.object({
  name: Joi.string().required().min(3).max(100).messages({
    "string.base": "Name must be a string",
    "string.empty": "Name is required",
    "string.min": "Name must be at least 3 characters long",
    "string.max": "Name must be less than 100 characters long",
  }),
  description: Joi.string().required().min(10).max(2000).messages({
    "string.base": "Description must be a string",
    "string.empty": "Description is required",
    "string.min": "Description must be at least 10 characters long",
    "string.max": "Description must be less than 2000 characters long",
  }),
  price: Joi.number().required().min(0.01).messages({
    "number.base": "Price must be a number",
    "number.min": "Price must be at least 0.01",
    "any.required": "Price is required",
  }),
  category: Joi.string().required().messages({
    "string.empty": "Category is required",
  }),
  variants: Joi.array().items(
    Joi.object({
      size: Joi.string().valid("XS", "S", "M", "L", "XL", "XXL", ""),
      color: Joi.string().allow(""),
      stock: Joi.number().min(0),
      price: Joi.number().min(0),
    }),
  ),
  stock: Joi.number().min(0),
  isFeatured: Joi.boolean(),
});

// Validation for updating a product
const updateProductValidation = Joi.object({
  name: Joi.string().min(3).max(100),
  description: Joi.string().min(10).max(2000),
  price: Joi.number().min(0.01),
  category: Joi.string(),
  variants: Joi.array().items(
    Joi.object({
      size: Joi.string().valid("XS", "S", "M", "L", "XL", "XXL", ""),
      color: Joi.string().allow(""),
      stock: Joi.number().min(0),
      price: Joi.number().min(0),
    }),
  ),
  stock: Joi.number().min(0),
  isActive: Joi.boolean(),
  isFeatured: Joi.boolean(),
  removeImages: Joi.array().items(Joi.string()),
});

// Validate image upload
const validateImages = (files, maxFiles = 5) => {
  const errors = [];

  if (!files || files.length === 0) {
    errors.push("At least one image is required");
    return errors;
  }

  if (files.length > maxFiles) {
    errors.push(`Maximum ${maxFiles} images allowed`);
  }

  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  const maxSize = 5 * 1024 * 1024; // 5MB

  files.forEach((file, index) => {
    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(
        `File ${index + 1}: Invalid format. Allowed: JPEG, PNG, WEBP, GIF`,
      );
    }
    if (file.size > maxSize) {
      errors.push(`File ${index + 1}: Size exceeds 5MB limit`);
    }
  });

  return errors;
};

module.exports = {
  createProductValidation,
  updateProductValidation,
  validateImages,
};
