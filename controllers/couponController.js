const asyncHandler = require("express-async-handler");
const Coupon = require("../models/Coupon");
const { validateCoupon } = require("../utils/validateCoupon");

// POST /api/coupons/validate  — public (optionalAuth supported by caller)
// body: { code, subtotal }
const validate = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body;
  if (typeof subtotal !== "number" || subtotal < 0) {
    res.status(400);
    throw new Error("Invalid cart subtotal");
  }
  try {
    const { coupon, discount } = await validateCoupon({
      code,
      subtotal,
      userId: req.user?._id || null,
    });
    res.json({
      valid: true,
      discount,
      coupon: coupon.publicView(),
    });
  } catch (err) {
    res.status(err.status || 400);
    throw err;
  }
});

// ---------------- Admin CRUD ----------------

// GET /api/coupons  (admin)
const listCoupons = asyncHandler(async (_req, res) => {
  const rows = await Coupon.find({}).sort({ createdAt: -1 });
  res.json(rows);
});

// POST /api/coupons  (admin)
const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    type,
    value,
    minOrderValue,
    maxDiscount,
    startsAt,
    expiresAt,
    usageLimit,
    perUserLimit,
    active,
  } = req.body;

  if (!code || !type || value === undefined) {
    res.status(400);
    throw new Error("code, type, and value are required");
  }
  if (!["percentage", "fixed"].includes(type)) {
    res.status(400);
    throw new Error('type must be "percentage" or "fixed"');
  }
  if (type === "percentage" && (value < 0 || value > 100)) {
    res.status(400);
    throw new Error("Percentage value must be 0–100");
  }

  const exists = await Coupon.findOne({ code: code.toUpperCase().trim() });
  if (exists) {
    res.status(400);
    throw new Error("A coupon with this code already exists");
  }

  const coupon = await Coupon.create({
    code,
    description,
    type,
    value,
    minOrderValue: minOrderValue ?? 0,
    maxDiscount: maxDiscount === "" ? null : maxDiscount ?? null,
    startsAt: startsAt ? new Date(startsAt) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    usageLimit: usageLimit === "" ? null : usageLimit ?? null,
    perUserLimit: perUserLimit ?? 1,
    active: active !== false,
  });
  res.status(201).json(coupon);
});

// PUT /api/coupons/:id  (admin)
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    res.status(404);
    throw new Error("Coupon not found");
  }
  const fields = [
    "description",
    "type",
    "value",
    "minOrderValue",
    "maxDiscount",
    "startsAt",
    "expiresAt",
    "usageLimit",
    "perUserLimit",
    "active",
    "code",
  ];
  for (const f of fields) {
    if (f in req.body) {
      if (f === "startsAt" || f === "expiresAt") {
        coupon[f] = req.body[f] ? new Date(req.body[f]) : null;
      } else if (f === "maxDiscount" || f === "usageLimit") {
        coupon[f] =
          req.body[f] === "" || req.body[f] == null ? null : req.body[f];
      } else {
        coupon[f] = req.body[f];
      }
    }
  }
  await coupon.save();
  res.json(coupon);
});

// DELETE /api/coupons/:id  (admin)
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) {
    res.status(404);
    throw new Error("Coupon not found");
  }
  await coupon.deleteOne();
  res.json({ message: "Coupon deleted" });
});

module.exports = {
  validate,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};
