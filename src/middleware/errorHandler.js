const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    const message = `Resource not found with id of ${err.value}`;
    error = { statusCode: 404, message };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const message = `${field} already exists`;
    error = { statusCode: 400, message };
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const message = Object.values(err.errors).map((val) => val.message);
    error = { statusCode: 400, message };
  }

  // JWT error
  if (err.name === "JsonWebTokenError") {
    const message = "Invalid token";
    error = { statusCode: 401, message };
  }

  if (err.name === "TokenExpiredError") {
    const message = "Token expired";
    error = { statusCode: 401, message };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

module.exports = { errorHandler };
