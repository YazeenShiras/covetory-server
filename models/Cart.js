const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    qty: { type: Number, required: true, min: 1, max: 99 },
    color: String,
    size: String,
    // Snapshots so the email can render even if the product/variant changes
    name: String,
    image: String,
    price: Number,
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    // One cart per user (enforce via unique index)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },

    // When the cart was last touched (any add/remove/update)
    updatedAt: { type: Date, default: Date.now, index: true },

    // Filled when the recovery worker decides this cart is abandoned.
    // Used to throttle further emails — only one per abandonment cycle.
    abandonedAt: Date,

    // When we sent the recovery email. null = never sent for this abandonment.
    recoveryEmailSentAt: Date,
  },
  { timestamps: true }
);

// On any save, bump updatedAt and reset abandonment markers if items changed
cartSchema.pre("save", function (next) {
  if (this.isModified("items")) {
    this.updatedAt = new Date();
    // If user is actively editing the cart, they're not abandoning — clear flags
    this.abandonedAt = undefined;
    this.recoveryEmailSentAt = undefined;
  }
  next();
});

module.exports = mongoose.model("Cart", cartSchema);
