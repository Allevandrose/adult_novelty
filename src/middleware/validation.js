const { validationResult, body, param, query } = require("express-validator");

// ✅ NEW: Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = errors.array().map((err) => ({
    field: err.path,
    message: err.msg,
  }));

  return res.status(400).json({
    success: false,
    message: "Validation error",
    errors: extractedErrors,
  });
};

// ✅ NEW: Auth validation rules
const validateAuth = {
  register: [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email address")
      .normalizeEmail()
      .trim()
      .escape(),

    body("phone")
      .matches(/^\+?[0-9]{10,15}$/)
      .withMessage("Please provide a valid phone number (10-15 digits)")
      .trim()
      .escape(),

    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "Password must contain at least one uppercase, one lowercase, and one number",
      ),

    body("confirmPassword")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Passwords do not match"),
  ],

  login: [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email")
      .normalizeEmail()
      .trim(),

    body("password").isLength({ min: 1 }).withMessage("Password is required"),
  ],

  forgotPassword: [
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email")
      .normalizeEmail()
      .trim(),
  ],

  resetPassword: [
    param("token").isLength({ min: 32 }).withMessage("Invalid reset token"),

    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "Password must contain at least one uppercase, one lowercase, and one number",
      ),

    body("confirmPassword")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Passwords do not match"),
  ],

  updateProfile: [
    body("email")
      .optional()
      .isEmail()
      .withMessage("Please provide a valid email")
      .normalizeEmail()
      .trim()
      .escape(),

    body("phone")
      .optional()
      .matches(/^\+?[0-9]{10,15}$/)
      .withMessage("Please provide a valid phone number")
      .trim()
      .escape(),
  ],
};

module.exports = {
  validate,
  validateAuth,
};
