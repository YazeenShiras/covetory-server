const asyncHandler = require("express-async-handler");
const User = require("../models/User");
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
  createdAt: u.createdAt,
});

// GET /api/users  (admin)
const getUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  res.json(users);
});

// PUT /api/users/profile  — updates basic fields (no password here)
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, address, phone, avatar } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (address !== undefined) user.address = address;
  if (phone !== undefined) user.phone = phone;
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

module.exports = {
  getUsers,
  updateProfile,
  changePassword,
  deleteMe,
  getWishlist,
  toggleWishlist,
  deleteUser,
  toggleAdmin,
};
