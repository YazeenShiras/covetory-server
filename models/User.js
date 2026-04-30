const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const addressSchema = new mongoose.Schema(
  {
    line1: String,
    line2: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    isAdmin: { type: Boolean, default: false },
    address: addressSchema,
    phone: String,
    avatar: {
      url: String,
      publicId: String,
    },
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    // Wishlist sharing — token is null when sharing is OFF.
    // Sparse unique so multiple "off" users (null token) don't collide.
    wishlistShareToken: {
      type: String,
      index: { unique: true, sparse: true },
    },
    // Optional display name on the public wishlist page. If blank, no name shown.
    wishlistShareName: { type: String, default: "", trim: true, maxlength: 40 },
    // Marketing email preferences
    marketingEmails: { type: Boolean, default: true },
    // password reset
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model("User", userSchema);
