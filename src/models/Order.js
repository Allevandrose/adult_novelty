const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: String,
        price: Number,
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        selectedVariant: {
          size: { type: String, default: "" },
          color: { type: String, default: "" },
        },
      },
    ],
    subtotal: {
      type: Number,
      required: true,
    },
    shippingCost: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    // ✅ FIX: Added 'payment_failed' to enum
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "paid",
        "payment_failed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    shippingAddress: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      county: { type: String, default: "" },
      postalCode: { type: String, default: "" },
      phone: { type: String, required: true },
    },
    // ✅ FIX: Complete payment schema matching IntaSend response
    payment: {
      method: {
        type: String,
        enum: ["mpesa", "airtel", "card", "bank_transfer", "checkout"],
        default: "checkout",
      },
      provider: {
        type: String,
        enum: ["INTASEND", "MPESA", "AIRTEL", "CARD", "BANK"],
        default: "INTASEND",
      },
      intasendInvoiceId: {
        type: String,
        index: true,
      },
      intasendTrackingId: {
        type: String,
      },
      paymentStatus: {
        type: String,
        enum: ["pending", "processing", "completed", "failed", "cancelled"],
        default: "pending",
      },
      paidAt: Date,
      amountPaid: Number,
      currency: {
        type: String,
        default: "KES",
      },
      redirectUrl: String,
      failedReason: String,
    },
    timeline: [
      {
        status: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        note: String,
      },
    ],
    invoiceUrl: String,
    notes: String,
  },
  {
    timestamps: true,
  },
);

// ✅ Compound indexes for common queries
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ "payment.intasendInvoiceId": 1 });

// Add timeline entry on status change
orderSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      note: `Order ${this.status.replace(/_/g, " ")}`,
    });
  }
  next();
});

// ✅ Virtual for order age
orderSchema.virtual("age").get(function () {
  return Date.now() - this.createdAt;
});

// ✅ Method to check if order can be cancelled
orderSchema.methods.canCancel = function () {
  return ["pending", "processing"].includes(this.status);
};

// ✅ Method to check if payment is complete
orderSchema.methods.isPaid = function () {
  return this.status === "paid" && this.payment?.paymentStatus === "completed";
};

// Ensure virtuals in JSON
orderSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    return ret;
  },
});
orderSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Order", orderSchema);
