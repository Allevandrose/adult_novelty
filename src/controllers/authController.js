const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");
const logger = require("../utils/logger");
const { getCache, setCache, deleteCache } = require("../config/redis");

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};

// Generate refresh token
const generateRefreshToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    const userExists = await User.findOne({ $or: [{ email }, { phone }] })
      .select("_id email phone")
      .lean();

    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email or phone",
      });
    }

    const user = await User.create({
      email,
      phone,
      password,
    });

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    const userData = {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };
    await setCache(`user:${user._id}`, userData, 3600);

    res.status(201).json({
      success: true,
      data: {
        ...userData,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ FIX: Removed .lean() to allow instance methods like comparePassword()
    const user = await User.findOne({ email }).select(
      "+password +loginAttempts +lockUntil",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check if account is locked
    if (user.isLocked && user.isLocked()) {
      const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        message: `Account locked. Please try again in ${remainingTime} minutes.`,
      });
    }

    // Check password - works because user is a Mongoose document
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Increment login attempts
      await user.incrementLoginAttempts();

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Reset login attempts on successful login
    await User.findByIdAndUpdate(user._id, {
      loginAttempts: 0,
      lockUntil: null,
    });

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Cache user session
    const userData = {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };
    await setCache(`user:${user._id}`, userData, 3600);
    await setCache(`session:${user._id}`, { token, refreshToken }, 3600);

    res.json({
      success: true,
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
      message: "Server error during login",
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

    await setCache(
      `session:${user._id}`,
      { token: newToken, refreshToken: newRefreshToken },
      3600,
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
    const cachedUser = await getCache(`user:${req.user.id}`);
    if (cachedUser) {
      return res.json({
        success: true,
        data: cachedUser,
        fromCache: true,
      });
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

    await setCache(`user:${req.user.id}`, user, 3600);

    res.json({
      success: true,
      data: user,
      fromCache: false,
    });
  } catch (error) {
    logger.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/me
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { email, phone } = req.body;

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

    await deleteCache(`user:${req.user.id}`);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
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
    user.resetPasswordExpires = Date.now() + 3600000;

    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password/${resetToken}`;

    setImmediate(async () => {
      try {
        await sendEmail({
          to: user.email,
          subject: "Password Reset Request - IntimaCare",
          html: `<h1>Reset Your Password</h1><p>Click <a href="${resetUrl}">here</a> to reset your password.</p>`,
        });
      } catch (emailError) {
        logger.error(`Failed to send email:`, emailError);
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

    await deleteCache(`user:${user._id}`);
    await deleteCache(`session:${user._id}`);

    res.json({
      success: true,
      message: "Password reset successfully",
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
    await deleteCache(`session:${req.user.id}`);

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
