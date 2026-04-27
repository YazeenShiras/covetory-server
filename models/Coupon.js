const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9_-]{3,24}$/, "Code must be 3–24 chars, A–Z 0–9 _ -"],
      index: true,
    },
    description: { type: String, trim: true, maxlength: 200 },

    // 'percentage' = value as percent (e.g. 15 => 15% off)
    // 'fixed'      = rupee amount off
    type: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    value: { type: Number, required: true, min: 0 }, // percent or rupees

    // Minimum cart subtotal (items only, before shipping & tax)
    minOrderValue: { type: Number, default: 0, min: 0 },

    // For percentage coupons — cap the max rupees off regardless of cart size
    maxDiscount: { type: Number, default: null, min: 0 },

    // Window
    startsAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },

    // Caps
    usageLimit: { type: Number, default: null, min: 1 }, // total uses across all users
    usedCount: { type: Number, default: 0, min: 0 },
    perUserLimit: { type: Number, default: 1, min: 1 }, // how many times one user can use

    // Which users have used it — only tracked for registered users
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Normalise code to uppercase on save
couponSchema.pre("validate", function (next) {
  if (this.code) this.code = this.code.toUpperCase().trim();
  next();
});

// Public-safe view
couponSchema.methods.publicView = function () {
  return {
    code: this.code,
    description: this.description,
    type: this.type,
    value: this.value,
    minOrderValue: this.minOrderValue,
    maxDiscount: this.maxDiscount,
  };
};

module.exports = mongoose.model("Coupon", couponSchema);
