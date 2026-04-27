const Coupon = require("../models/Coupon");

/**
 * Validate a coupon against a cart subtotal for a specific user (optional).
 * Returns { coupon, discount } if valid, or throws an Error (with .status).
 *
 *   coupon   — the Coupon document
 *   discount — rupees to subtract from the subtotal
 *
 * Caller should still handle failure modes (user-facing message).
 */
async function validateCoupon({
  code,
  subtotal,
  userId = null,
  guestEmail = null,
}) {
  if (!code || typeof code !== "string") {
    const err = new Error("Enter a promo code");
    err.status = 400;
    throw err;
  }
  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });
  if (!coupon || !coupon.active) {
    const err = new Error("This code is not valid");
    err.status = 404;
    throw err;
  }

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    const err = new Error("This code is not active yet");
    err.status = 400;
    throw err;
  }
  if (coupon.expiresAt && now > coupon.expiresAt) {
    const err = new Error("This code has expired");
    err.status = 400;
    throw err;
  }
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    const err = new Error("This code has reached its usage limit");
    err.status = 400;
    throw err;
  }

  if (subtotal < coupon.minOrderValue) {
    const err = new Error(
      `Add ₹${(coupon.minOrderValue - subtotal).toLocaleString(
        "en-IN"
      )} more to use this code`
    );
    err.status = 400;
    throw err;
  }

  // Per-user limit (registered users only — we can't reliably track guests)
  if (userId) {
    const timesUsed = (coupon.usedBy || []).filter(
      (id) => String(id) === String(userId)
    ).length;
    if (timesUsed >= coupon.perUserLimit) {
      const err = new Error("You have already used this code");
      err.status = 400;
      throw err;
    }
  }

  // Calculate discount
  let discount = 0;
  if (coupon.type === "percentage") {
    discount = (subtotal * coupon.value) / 100;
    if (coupon.maxDiscount != null)
      discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.value;
  }
  // Never discount more than the subtotal
  discount = Math.min(discount, subtotal);
  discount = +discount.toFixed(2);

  return { coupon, discount };
}

module.exports = { validateCoupon };
