const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { sendEmail } = require("../config/email");
const templates = require("../utils/emailTemplates");

const publicUser = (user, token) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address,
  avatar: user.avatar,
  wishlist: user.wishlist,
  isAdmin: user.isAdmin,
  createdAt: user.createdAt,
  ...(token && { token }),
});

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    res.status(400);
    throw new Error("All fields are required");
  }
  const exists = await User.findOne({ email });
  if (exists) {
    res.status(400);
    throw new Error("Email already registered");
  }
  const user = await User.create({ name, email, password });

  // Welcome email — best effort, don't block registration
  sendEmail({ to: user.email, ...templates.welcome({ name: user.name }) });

  res.status(201).json(publicUser(user, generateToken(user._id)));
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error("Invalid email or password");
  }
  res.json(publicUser(user, generateToken(user._id)));
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  res.json(req.user);
});

// POST /api/auth/forgot-password
// body: { email }
// Always returns 200 (don't leak which emails exist)
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error("Email is required");
  }
  const user = await User.findOne({ email });

  // Uniform success response regardless of user existence
  const respond = () =>
    res.json({
      message:
        "If an account exists for that email, a reset link is on its way.",
    });

  if (!user) return respond();

  // Generate a raw token, store only the hash in DB
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.resetPasswordToken = hash;
  user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${frontend}/reset-password?token=${rawToken}&email=${encodeURIComponent(
    user.email
  )}`;

  await sendEmail({
    to: user.email,
    ...templates.passwordReset({ name: user.name, resetUrl }),
  });

  respond();
});

// POST /api/auth/reset-password
// body: { email, token, password }
const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;
  if (!email || !token || !password) {
    res.status(400);
    throw new Error("Missing fields");
  }
  if (password.length < 6) {
    res.status(400);
    throw new Error("Password must be at least 6 characters");
  }
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ email }).select(
    "+resetPasswordToken +resetPasswordExpires +password"
  );
  if (
    !user ||
    !user.resetPasswordToken ||
    user.resetPasswordToken !== hash ||
    !user.resetPasswordExpires ||
    user.resetPasswordExpires < new Date()
  ) {
    res.status(400);
    throw new Error("Reset link is invalid or has expired.");
  }
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ message: "Password reset. You can sign in now." });
});

module.exports = { register, login, me, forgotPassword, resetPassword };
