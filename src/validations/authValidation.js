// Re-export validation rules from middleware
const { validateAuth, validate } = require("../middleware/validation");

module.exports = {
  validateAuth,
  validate,
};
