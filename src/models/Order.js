// models/Order.js
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
      processedEvents: [String], // ✅ Track event IDs to prevent duplicate webhook processing
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

// ✅ Method to check if webhook event was already processed
orderSchema.methods.isEventProcessed = function (eventId) {
  if (!this.payment.processedEvents) {
    this.payment.processedEvents = [];
  }
  return this.payment.processedEvents.includes(eventId);
};

// ✅ Method to mark webhook event as processed
orderSchema.methods.markEventProcessed = function (eventId) {
  if (!this.payment.processedEvents) {
    this.payment.processedEvents = [];
  }
  if (!this.payment.processedEvents.includes(eventId)) {
    this.payment.processedEvents.push(eventId);
  }
};

// ✅ Method to update payment status with proper validation
orderSchema.methods.updatePaymentStatus = function (status, metadata = {}) {
  const validStatuses = [
    "pending",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid payment status: ${status}`);
  }

  this.payment.paymentStatus = status;

  // Update order status based on payment status
  if (status === "completed") {
    this.status = "paid";
    this.payment.paidAt = new Date();
    if (metadata.amountPaid) {
      this.payment.amountPaid = metadata.amountPaid;
    }
    if (metadata.currency) {
      this.payment.currency = metadata.currency;
    }
  } else if (status === "failed") {
    this.status = "payment_failed";
    if (metadata.failedReason) {
      this.payment.failedReason = metadata.failedReason;
    }
  } else if (status === "cancelled") {
    this.status = "cancelled";
  }

  // Add timeline entry
  this.timeline.push({
    status: this.status,
    timestamp: new Date(),
    note: `Payment ${status}: ${metadata.failedReason || metadata.note || ""}`,
  });
};

// ✅ Method to format order for API response
orderSchema.methods.toApiResponse = function () {
  const order = this.toJSON();
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: order.totalAmount,
    paymentStatus: order.payment.paymentStatus,
    paidAt: order.payment.paidAt,
    items: order.items,
    shippingAddress: order.shippingAddress,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    timeline: order.timeline,
    invoiceUrl: order.invoiceUrl,
    canCancel: order.canCancel,
    isPaid: order.isPaid,
  };
};

// ✅ Static method to find orders by payment ID
orderSchema.statics.findByIntaSendInvoiceId = function (invoiceId) {
  return this.findOne({ "payment.intasendInvoiceId": invoiceId });
};

// ✅ Static method to get orders needing payment verification
orderSchema.statics.getPendingPaymentOrders = function () {
  return this.find({
    "payment.paymentStatus": { $in: ["pending", "processing"] },
    status: { $in: ["pending", "processing"] },
  }).populate("user", "email name");
};

// Ensure virtuals in JSON
orderSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
orderSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Order", orderSchema);
