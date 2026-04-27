const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userName: String, // snapshot so it survives user deletion
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 140 },
    body: { type: String, trim: true, maxlength: 2000 },
    verifiedPurchase: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false }, // admin moderation
  },
  { timestamps: true }
);

// One review per (user, product) pair
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
