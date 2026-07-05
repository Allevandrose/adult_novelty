// src/controllers/authController.js
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email or phone",
      });
    }

    // Create user
    const user = await User.create({
      email,
      phone,
      password,
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
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

    // Check for user
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);
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
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if email/phone already exists
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        });
      }
      user.email = email;
    }

    if (phone && phone !== user.phone) {
      const phoneExists = await User.findOne({ phone });
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone already in use",
        });
      }
      user.phone = phone;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
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

    console.log("📧 Forgot password request for:", email);

    const user = await User.findOne({ email });
    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(404).json({
        success: false,
        message: "No user found with this email",
      });
    }

    console.log("✅ User found:", user.email);

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token and save to database
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();
    console.log("✅ Reset token saved for user:", user.email);

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password/${resetToken}`;
    console.log("🔑 Reset URL:", resetUrl);

    // Send email
    console.log("📧 Attempting to send email...");
    const emailResult = await sendEmail({
      to: user.email,
      subject: "Password Reset Request - IntimaCare",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background: #F7F3EA; padding: 40px 20px; }
              .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border: 1px solid #E6DFD1; }
              .header { text-align: center; border-bottom: 1px solid #E6DFD1; padding-bottom: 20px; margin-bottom: 30px; }
              .logo { font-family: Georgia, serif; font-size: 24px; color: #14120F; }
              .button { display: inline-block; background: #14120F; color: #F7F3EA; padding: 12px 40px; text-decoration: none; letter-spacing: 0.15em; text-transform: uppercase; font-size: 12px; border: none; cursor: pointer; }
              .button:hover { background: #1F3D33; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #E6DFD1; text-align: center; font-size: 12px; color: #8C7B6B; }
              .expiry { background: #FBF9F4; padding: 15px; font-size: 13px; color: #5C5348; margin: 20px 0; border-left: 3px solid #B08D4F; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">IntimaCare</div>
              </div>
              
              <h2 style="font-family: Georgia, serif; font-weight: 300; color: #14120F; margin-bottom: 10px;">Reset Your Password</h2>
              <p style="color: #5C5348; line-height: 1.6; margin-bottom: 25px;">
                We received a request to reset the password for your IntimaCare account. Click the button below to create a new password.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              
              <div class="expiry">
                ⏰ This link will expire in <strong>1 hour</strong>.
              </div>
              
              <p style="color: #5C5348; font-size: 14px; margin-top: 20px;">
                If you didn't request this, please ignore this email or contact support.
              </p>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} IntimaCare. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    console.log("📧 Email result:", emailResult);

    res.json({
      success: true,
      message: "Password reset link sent to your email",
      resetUrl: process.env.NODE_ENV === "development" ? resetUrl : undefined,
    });
  } catch (error) {
    console.error("❌ Forgot password error:", error);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: `Error sending reset email: ${error.message}`,
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

    // Hash the token from URL
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
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

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    console.log("✅ Password reset successful for:", user.email);

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting password",
    });
  }
};
