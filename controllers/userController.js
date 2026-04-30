const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const User = require("../models/User");
const Product = require("../models/Product");
const { cloudinary } = require("../config/cloudinary");

const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  address: u.address,
  avatar: u.avatar,
  wishlist: u.wishlist,
  isAdmin: u.isAdmin,
  marketingEmails: u.marketingEmails !== false,
  wishlistShareToken: u.wishlistShareToken || null,
  wishlistShareName: u.wishlistShareName || "",
  createdAt: u.createdAt,
});

// GET /api/users  (admin)
const getUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  res.json(users);
});

// PUT /api/users/profile  — updates basic fields (no password here)
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, address, phone, avatar, marketingEmails } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (address !== undefined) user.address = address;
  if (phone !== undefined) user.phone = phone;
  if (typeof marketingEmails === "boolean")
    user.marketingEmails = marketingEmails;
  if (avatar !== undefined) {
    if (user.avatar?.publicId && user.avatar.publicId !== avatar?.publicId) {
      try {
        await cloudinary.uploader.destroy(user.avatar.publicId);
      } catch (_) {}
    }
    user.avatar = avatar;
  }
  await user.save();
  res.json(publicUser(user));
});

// PUT /api/users/password  — requires current password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Both current and new passwords are required");
  }
  if (newPassword.length < 6) {
    res.status(400);
    throw new Error("New password must be at least 6 characters");
  }
  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  const match = await user.matchPassword(currentPassword);
  if (!match) {
    res.status(401);
    throw new Error("Current password is incorrect");
  }
  user.password = newPassword;
  await user.save();
  res.json({ message: "Password updated" });
});

// DELETE /api/users/me  — self account deletion
const deleteMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.isAdmin) {
    res.status(400);
    throw new Error("Admins cannot delete themselves from this endpoint");
  }
  if (user.avatar?.publicId) {
    try {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    } catch (_) {}
  }
  await user.deleteOne();
  res.json({ message: "Account deleted" });
});

// GET /api/users/wishlist  — returns populated products
const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate("wishlist");
  res.json(user.wishlist || []);
});

// POST /api/users/wishlist/:productId  — toggle
const toggleWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const pid = req.params.productId;
  const idx = user.wishlist.findIndex((id) => String(id) === String(pid));
  if (idx >= 0) user.wishlist.splice(idx, 1);
  else user.wishlist.push(pid);
  await user.save();
  res.json({ wishlist: user.wishlist });
});

// DELETE /api/users/:id  (admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.isAdmin) {
    res.status(400);
    throw new Error("Cannot delete admin user");
  }
  await user.deleteOne();
  res.json({ message: "User deleted" });
});

// PUT /api/users/:id/admin  (admin)
const toggleAdmin = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.isAdmin = !user.isAdmin;
  await user.save();
  res.json(user);
});

// POST /api/users/wishlist/share — turn sharing ON or regenerate the token
// body: { name?: string }   — optional first-name display
const enableWishlistShare = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  // 16 random bytes → 22-char base64url. Short enough for a URL, plenty unguessable.
  const token = crypto.randomBytes(16).toString("base64url");
  user.wishlistShareToken = token;
  if (typeof req.body?.name === "string") {
    user.wishlistShareName = req.body.name.slice(0, 40).trim();
  }
  await user.save();
  res.json({
    token,
    name: user.wishlistShareName,
  });
});

// DELETE /api/users/wishlist/share — turn sharing OFF (invalidates the link)
const disableWishlistShare = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.wishlistShareToken = null;
  await user.save();
  res.json({ ok: true });
});

// GET /api/wishlist/:token  — public lookup
// Returns wishlist items (names, images, prices, IDs) and optional display name.
// No identifying user info is exposed.
const getSharedWishlist = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token || typeof token !== "string" || token.length < 8) {
    res.status(404);
    throw new Error("Wishlist not found");
  }
  const user = await User.findOne({ wishlistShareToken: token })
    .select("wishlist wishlistShareName")
    .populate({
      path: "wishlist",
      select:
        "name price compareAtPrice images colors category stock variantStock",
    });
  if (!user) {
    res.status(404);
    throw new Error("Wishlist not found");
  }

  // Project to a public-safe shape
  const items = (user.wishlist || []).map((p) => ({
    _id: p._id,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    category: p.category,
    image: p.colors?.[0]?.images?.[0]?.url || p.images?.[0]?.url || null,
    inStock:
      (p.stock || 0) > 0 ||
      (p.variantStock &&
        Object.values(p.variantStock).some((v) => Number(v) > 0)),
  }));

  res.json({
    name: user.wishlistShareName || "",
    items,
    count: items.length,
  });
});

module.exports = {
  getUsers,
  updateProfile,
  changePassword,
  deleteMe,
  getWishlist,
  toggleWishlist,
  deleteUser,
  toggleAdmin,
  enableWishlistShare,
  disableWishlistShare,
  getSharedWishlist,
};
