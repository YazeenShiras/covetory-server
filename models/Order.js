const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    name: String,
    image: String,
    price: Number,
    qty: Number,
    color: String,
    size: String,
    hsn: String, // HSN/SAC code — snapshot for tax invoice
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    // Either `user` (registered customer) or `guestEmail` (anonymous checkout) is required.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    guestEmail: { type: String, lowercase: true, trim: true, index: true },
    guestName: String,
    items: [orderItemSchema],
    shippingAddress: {
      name: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      phone: String,
    },
    paymentMethod: { type: String, default: "cod" }, // cod | razorpay
    itemsPrice: Number,
    shippingPrice: Number,
    taxPrice: Number,
    discountPrice: { type: Number, default: 0 },
    couponCode: String, // stored on the order so it survives coupon edits/deletes
    totalPrice: Number,
    currency: { type: String, default: "INR" },

    // GST invoice fields
    invoiceNumber: { type: String, index: true, unique: true, sparse: true },
    invoiceDate: Date,
    buyerGstin: { type: String, trim: true, uppercase: true }, // optional — B2B buyer can claim ITC
    // Breakdown computed at invoice time; either CGST+SGST (intra-state) or IGST (inter-state)
    taxBreakdown: {
      type: {
        type: String,
        enum: ["cgst_sgst", "igst"],
      },
      cgst: Number,
      sgst: Number,
      igst: Number,
      rate: Number, // 18 for 18%
    },
    isPaid: { type: Boolean, default: false },
    paidAt: Date,
    paymentResult: {
      provider: String, // 'razorpay'
      orderId: String, // razorpay order id
      paymentId: String, // razorpay payment id
      signature: String, // razorpay verification signature
      status: String, // 'created' | 'paid' | 'failed'
    },
    status: {
      type: String,
      enum: ["pending", "processing", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    statusHistory: [
      {
        status: String,
        at: { type: Date, default: Date.now },
      },
    ],
    // Tracking info — only relevant once shipped
    courier: String, // e.g. "Delhivery", "Bluedart"
    trackingNumber: String,
    trackingUrl: String,
    adminNote: String, // internal-only note for admins
  },
  { timestamps: true }
);

// An order must have either a registered user OR a guest email.
orderSchema.pre("validate", function (next) {
  if (!this.user && !this.guestEmail) {
    return next(new Error("Order must have either a user or a guestEmail"));
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);
