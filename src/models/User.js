const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
      index: true, // ✅ FIX: Add index for faster lookups
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
      index: true, // ✅ FIX: Add index for faster lookups
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // ✅ FIX: Don't include by default in queries
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true, // ✅ FIX: Index for role-based queries
    },
    // ✅ FIX: Remove telegramChatId - not used
    // Password reset fields
    resetPasswordToken: {
      type: String,
      index: true, // ✅ FIX: Index for faster token lookups
    },
    resetPasswordExpires: {
      type: Date,
    },
    // Email verification fields
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpires: {
      type: Date,
    },
    // ✅ FIX: Add account lockout fields
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// ✅ FIX: Create compound index for common queries
userSchema.index({ email: 1, role: 1 });
userSchema.index({ phone: 1, role: 1 });
userSchema.index({ resetPasswordToken: 1, resetPasswordExpires: 1 });

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    // ✅ FIX: Use 12 rounds for better security (still fast)
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (err) {
    next(err);
  }
});

// ✅ FIX: Instance method to check if account is locked
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// ✅ FIX: Instance method to increment login attempts
userSchema.methods.incrementLoginAttempts = async function () {
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

  if (this.lockUntil && this.lockUntil < Date.now()) {
    // Reset if lock expired
    this.loginAttempts = 1;
    this.lockUntil = undefined;
  } else {
    this.loginAttempts += 1;

    if (this.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
      this.lockUntil = new Date(Date.now() + LOCK_TIME);
    }
  }

  await this.save();
};

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
