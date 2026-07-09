const { validationResult, body, param } = require("express-validator");

// Validation middleware with improved error formatting
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = errors.array().map((err) => ({
    field: err.path,
    message: err.msg,
  }));

  // Log validation errors for debugging
  console.log(
    "❌ Validation errors:",
    JSON.stringify(extractedErrors, null, 2),
  );

  return res.status(400).json({
    success: false,
    message: extractedErrors[0]?.message || "Validation error",
    errors: extractedErrors,
  });
};

// Auth validation rules
const validateAuth = {
  register: [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email address")
      .normalizeEmail()
      .trim(),

    body("phone")
      .matches(/^\+?[0-9]{10,15}$/)
      .withMessage("Please provide a valid phone number (10-15 digits)")
      .trim(),

    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      ),

    body("confirmPassword").custom((value, { req }) => {
      if (!value) {
        throw new Error("Please confirm your password");
      }
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
  ],

  login: [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email address")
      .normalizeEmail()
      .trim(),

    body("password").notEmpty().withMessage("Password is required"),
  ],

  forgotPassword: [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email address")
      .normalizeEmail()
      .trim(),
  ],

  resetPassword: [
    param("token").notEmpty().withMessage("Reset token is required"),

    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "Password must contain at least one uppercase letter, one lowercase letter, and one number",
      ),

    body("confirmPassword").custom((value, { req }) => {
      if (!value) {
        throw new Error("Please confirm your password");
      }
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
  ],

  updateProfile: [
    body("email")
      .optional()
      .isEmail()
      .withMessage("Please provide a valid email address")
      .normalizeEmail()
      .trim(),

    body("phone")
      .optional()
      .matches(/^\+?[0-9]{10,15}$/)
      .withMessage("Please provide a valid phone number (10-15 digits)")
      .trim(),
  ],
};

module.exports = {
  validate,
  validateAuth,
};
