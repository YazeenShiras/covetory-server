const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

const protect = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorised — no token");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      res.status(401);
      throw new Error("User no longer exists");
    }
    next();
  } catch (err) {
    res.status(401);
    throw new Error("Not authorised — invalid token");
  }
});

const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) return next();
  res.status(403);
  throw new Error("Admin access required");
};

// Loads req.user if a valid token is present; otherwise silently continues.
// Never throws. Useful for endpoints that behave differently for logged-in
// vs anonymous callers (e.g. guest checkout, PDF links opened in new tabs).
const optionalAuth = asyncHandler(async (req, _res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.query && req.query.token) {
    // Used by PDF links (new tab can't set Authorization header)
    token = req.query.token;
  }
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user) req.user = user;
  } catch (_) {
    // invalid token — treat as anonymous, don't block
  }
  next();
});

module.exports = { protect, admin, optionalAuth };
