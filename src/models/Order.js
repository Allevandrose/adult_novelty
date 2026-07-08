const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
          size: String,
          color: String,
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
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    shippingAddress: {
      street: String,
      city: String,
      county: String,
      postalCode: String,
      phone: String,
    },
    payment: {
      method: {
        type: String,
        enum: ["mpesa", "airtel", "card"],
      },
      // ✅ Renamed from pesapal to intasend
      intasendInvoiceId: {
        type: String,
        index: true,
      },
      intasendTrackingId: {
        type: String,
      },
      paymentStatus: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending",
      },
      paidAt: Date,
      redirectUrl: String,
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

// Add timeline entry on status change
orderSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      note: `Order ${this.status}`,
    });
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
