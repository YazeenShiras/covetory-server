const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const { razorpay, isConfigured } = require("../config/razorpay");
const Order = require("../models/Order");

const guardConfigured = (res) => {
  if (!isConfigured()) {
    res.status(503);
    throw new Error(
      "Razorpay is not configured on the server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }
};

// Ownership check: either authenticated owner, or guest-email match
function assertOrderAccess(req, order, res, guestEmail) {
  if (req.user) {
    const isOwner = order.user && String(order.user) === String(req.user._id);
    if (isOwner || req.user.isAdmin) return;
    res.status(403);
    throw new Error("Not allowed");
  }
  // anonymous — must provide guestEmail matching the order
  const clean = String(guestEmail || "")
    .toLowerCase()
    .trim();
  if (!clean || clean !== String(order.guestEmail || "").toLowerCase()) {
    res.status(403);
    throw new Error("Email does not match this order");
  }
}

// POST /api/payment/razorpay/order
// body: { orderId, guestEmail? }
const createRazorpayOrder = asyncHandler(async (req, res) => {
  guardConfigured(res);

  const { orderId, guestEmail } = req.body;
  if (!orderId) {
    res.status(400);
    throw new Error("orderId is required");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  assertOrderAccess(req, order, res, guestEmail);
  if (order.isPaid) {
    res.status(400);
    throw new Error("Order already paid");
  }

  // Razorpay uses the smallest currency unit (paise for INR).
  const amountInPaise = Math.round(order.totalPrice * 100);

  let rzpOrder;
  try {
    rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: order.currency || "INR",
      receipt: `rcpt_${order._id}`,
      notes: {
        orderId: String(order._id),
        userId: String(order.user || ""),
        guestEmail: order.guestEmail || "",
      },
    });
  } catch (err) {
    console.error("[razorpay] orders.create failed:", err?.error || err);
    res.status(502);
    throw new Error(
      err?.error?.description
        ? `Razorpay: ${err.error.description}`
        : "Could not reach Razorpay"
    );
  }

  order.paymentMethod = "razorpay";
  order.paymentResult = {
    provider: "razorpay",
    orderId: rzpOrder.id,
    status: "created",
  };
  await order.save();

  res.json({
    razorpayOrderId: rzpOrder.id,
    amount: rzpOrder.amount,
    currency: rzpOrder.currency,
    keyId: process.env.RAZORPAY_KEY_ID,
    orderId: order._id,
  });
});

// POST /api/payment/razorpay/verify
// body: { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, guestEmail? }
const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  guardConfigured(res);

  const {
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    guestEmail,
  } = req.body;
  if (
    !orderId ||
    !razorpayOrderId ||
    !razorpayPaymentId ||
    !razorpaySignature
  ) {
    res.status(400);
    throw new Error("Missing payment verification fields");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  assertOrderAccess(req, order, res, guestEmail);
  if (order.paymentResult?.orderId !== razorpayOrderId) {
    res.status(400);
    throw new Error("Razorpay order mismatch");
  }

  // Razorpay signature = HMAC-SHA256(razorpay_order_id + '|' + razorpay_payment_id, key_secret)
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpaySignature) {
    order.paymentResult.status = "failed";
    await order.save();
    res.status(400);
    throw new Error("Invalid payment signature");
  }

  order.isPaid = true;
  order.paidAt = new Date();
  order.status = "processing";
  order.paymentResult = {
    provider: "razorpay",
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
    status: "paid",
  };
  await order.save();

  res.json({ success: true, order });
});

// GET /api/payment/config  — exposes whether razorpay is enabled
const getPaymentConfig = asyncHandler(async (_req, res) => {
  res.json({
    razorpay: {
      enabled: isConfigured(),
      keyId: isConfigured() ? process.env.RAZORPAY_KEY_ID : null,
    },
  });
});

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentConfig,
};
