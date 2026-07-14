const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");
const logger = require("../utils/logger");

// ✅ FIX: Make Redis truly optional
let getCache, setCache, deleteCache;
try {
  const redis = require("../config/redis");
  getCache = redis.getCache;
  setCache = redis.setCache;
  deleteCache = redis.deleteCache;
} catch (e) {
  logger.warn("Redis not available - continuing without cache");
  getCache = async () => null;
  setCache = async () => {};
  deleteCache = async () => {};
}

// Generate JWT Token - ✅ FIX: Consistent payload with 'id'
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });
};

// ✅ FIX: Use environment variable for refresh token expiry
const generateRefreshToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || "7d",
    },
  );
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, phone, password, name } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({
      $or: [{ email }, { phone }],
    })
      .select("_id email phone")
      .lean();

    if (userExists) {
      const existingField = userExists.email === email ? "email" : "phone";
      return res.status(400).json({
        success: false,
        message: `An account with this ${existingField} already exists`,
        field: existingField,
      });
    }

    // Create user
    const user = await User.create({
      email,
      phone,
      password,
      name: name || "",
    });

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // ✅ FIX: Consistent user data with both _id and id
    const userData = {
      _id: user._id,
      id: user._id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };

    // Cache user data (non-blocking)
    setCache(`user:${user._id}`, userData, 3600).catch((err) =>
      logger.warn("Failed to cache user data:", err.message),
    );

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: {
        ...userData,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error("Register error:", error);

    // Handle mongoose validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || "Validation error",
        errors: messages,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `An account with this ${field} already exists`,
        field,
      });
    }

    res.status(500).json({
      success: false,
      message: "An error occurred during registration. Please try again.",
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ FIX: Optimize query - only select needed fields
    const user = await User.findOne({ email })
      .select("+password +loginAttempts +lockUntil")
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        message: `Account locked. Please try again in ${remainingTime} minutes.`,
        lockedUntil: user.lockUntil,
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // ✅ FIX: Atomic increment using $inc directly
      const MAX_LOGIN_ATTEMPTS = 5;
      const LOCK_TIME = 15 * 60 * 1000;

      const update = {
        $inc: { loginAttempts: 1 },
      };

      if (user.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
        update.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
      }

      await User.findByIdAndUpdate(user._id, update);

      const attemptsLeft = MAX_LOGIN_ATTEMPTS - (user.loginAttempts + 1);
      return res.status(401).json({
        success: false,
        message:
          attemptsLeft > 0
            ? `Invalid email or password. ${attemptsLeft} attempts remaining.`
            : "Invalid email or password",
      });
    }

    // ✅ FIX: Reset login attempts atomically
    await User.findByIdAndUpdate(user._id, {
      $set: { loginAttempts: 0, lockUntil: null },
    });

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // ✅ FIX: Consistent user data format
    const userData = {
      _id: user._id,
      id: user._id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };

    // Cache session (non-blocking)
    Promise.all([
      setCache(`user:${user._id}`, userData, 3600),
      setCache(`session:${user._id}`, { token, refreshToken }, 3600),
    ]).catch((err) => logger.warn("Failed to cache session:", err.message));

    res.json({
      success: true,
      message: "Login successful",
      data: {
        ...userData,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred during login. Please try again.",
    });
  }
};

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    );

    const user = await User.findById(decoded.id).lean();
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    setCache(
      `session:${user._id}`,
      { token: newToken, refreshToken: newRefreshToken },
      3600,
    ).catch((err) =>
      logger.warn("Failed to cache refresh token:", err.message),
    );

    res.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    logger.error("Refresh token error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // Try cache first
    try {
      const cachedUser = await getCache(`user:${req.user.id}`);
      if (cachedUser) {
        return res.json({
          success: true,
          data: cachedUser,
        });
      }
    } catch (cacheError) {
      logger.debug("Cache miss for user:", cacheError.message);
    }

    const user = await User.findById(req.user.id)
      .select("-password -__v")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ✅ FIX: Ensure consistent format
    const userData = {
      ...user,
      id: user._id,
    };

    // Cache user data
    setCache(`user:${req.user.id}`, userData, 3600).catch((err) =>
      logger.warn("Failed to cache user:", err.message),
    );

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    logger.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching profile",
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/me
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { email, phone, name } = req.body;
    const updateData = {};

    if (email) {
      const emailExists = await User.findOne({
        email,
        _id: { $ne: req.user.id },
      });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        });
      }
      updateData.email = email;
    }

    if (phone) {
      const phoneExists = await User.findOne({
        phone,
        _id: { $ne: req.user.id },
      });
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone already in use",
        });
      }
      updateData.phone = phone;
    }

    if (name) {
      updateData.name = name;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -__v");

    // Clear cache
    deleteCache(`user:${req.user.id}`).catch((err) =>
      logger.warn("Failed to clear cache:", err.message),
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });
  } catch (error) {
    logger.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profile",
    });
  }
};

// @desc    Forgot password - send reset token
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      // Return same message for security
      return res.json({
        success: true,
        message: "If a user exists with this email, a reset link will be sent",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/reset-password/${resetToken}`;

    // Send email asynchronously
    setImmediate(async () => {
      try {
        await sendEmail({
          to: user.email,
          subject: "Password Reset Request - IntimaCare",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #B08D4F;">Reset Your Password</h1>
              <p>You requested a password reset for your IntimaCare account.</p>
              <p>Click the button below to reset your password. This link expires in 1 hour.</p>
              <a href="${resetUrl}" 
                 style="display: inline-block; padding: 12px 24px; background-color: #B08D4F; color: white; text-decoration: none; border-radius: 4px;">
                Reset Password
              </a>
              <p style="margin-top: 20px; font-size: 14px; color: #666;">
                If you didn't request this, please ignore this email.
              </p>
            </div>
          `,
        });
      } catch (emailError) {
        logger.error(`Failed to send password reset email:`, emailError);
      }
    });

    res.json({
      success: true,
      message: "If a user exists with this email, a reset link will be sent",
    });
  } catch (error) {
    logger.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing password reset request",
    });
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;

    await user.save();

    // Clear all user sessions
    Promise.all([
      deleteCache(`user:${user._id}`),
      deleteCache(`session:${user._id}`),
    ]).catch((err) => logger.warn("Failed to clear cache:", err.message));

    res.json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
    });
  } catch (error) {
    logger.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting password",
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    deleteCache(`session:${req.user.id}`).catch((err) =>
      logger.warn("Failed to clear session cache:", err.message),
    );

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    logger.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Error logging out",
    });
  }
};

// ✅ FIX: Add bcrypt require at top
const bcrypt = require("bcryptjs");
