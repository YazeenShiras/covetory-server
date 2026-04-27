const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Return = require("../models/Return");
const Order = require("../models/Order");
const { sendEmail } = require("../config/email");

const RETURN_WINDOW_DAYS = 30;

// ---------- Helpers ----------

function isWithinWindow(deliveredAt) {
  if (!deliveredAt) return false;
  const ms = Date.now() - new Date(deliveredAt).getTime();
  return ms <= RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function getDeliveredAt(order) {
  // Prefer status history entry for 'delivered'; fall back to current state if status is delivered
  const entry = (order.statusHistory || []).find(
    (h) => h.status === "delivered"
  );
  if (entry?.at) return entry.at;
  if (order.status === "delivered") return order.updatedAt;
  return null;
}

function canActOnReturn(req, ret, orderUserId, orderGuestEmail, providedEmail) {
  if (req.user?.isAdmin) return true;
  if (req.user && orderUserId && String(orderUserId) === String(req.user._id))
    return true;
  if (ret?.user && req.user && String(ret.user) === String(req.user._id))
    return true;
  // Guest fallback — must provide matching email
  const email = String(providedEmail || "")
    .toLowerCase()
    .trim();
  if (email && (ret?.guestEmail === email || orderGuestEmail === email))
    return true;
  return false;
}

async function notifyCustomer(ret, order, subject, text) {
  const recipient = order?.user?.email || ret.guestEmail || order?.guestEmail;
  if (!recipient) return;
  sendEmail({
    to: recipient,
    subject,
    text,
    html: `<p>${text}</p><p>Reference: <b>${ret._id}</b></p>`,
  });
}

// ---------- Customer endpoints ----------

// POST /api/returns
// body: { orderId, type, items: [{product, qty, color?, size?}], reason, notes?, replacementRequest?, guestEmail? }
const createReturn = asyncHandler(async (req, res) => {
  const {
    orderId,
    type,
    items,
    reason,
    notes,
    replacementRequest,
    guestEmail,
  } = req.body;

  if (!orderId || !items?.length || !reason) {
    res.status(400);
    throw new Error("orderId, items, and reason are required");
  }
  if (type && !Return.TYPES.includes(type)) {
    res.status(400);
    throw new Error("Invalid type");
  }
  if (!Return.REASONS.includes(reason)) {
    res.status(400);
    throw new Error("Invalid reason");
  }

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    res.status(404);
    throw new Error("Order not found");
  }

  const order = await Order.findById(orderId).populate("user", "name email");
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  // Access control — owner, admin, or matching guest email
  if (
    !canActOnReturn(req, null, order.user?._id, order.guestEmail, guestEmail)
  ) {
    res.status(403);
    throw new Error("You do not have access to this order");
  }

  // Order must be delivered
  if (order.status !== "delivered") {
    res.status(400);
    throw new Error("Returns are only available after delivery");
  }

  // Within return window
  const deliveredAt = getDeliveredAt(order);
  if (!isWithinWindow(deliveredAt)) {
    res.status(400);
    throw new Error(`Return window of ${RETURN_WINDOW_DAYS} days has passed`);
  }

  // Validate each item exists in the order with sufficient qty
  // (and aggregate already-returned qty so customer can't return more than purchased)
  const existingReturns = await Return.find({
    order: order._id,
    status: { $nin: ["rejected", "cancelled"] },
  });
  const alreadyReturnedQty = new Map();
  for (const r of existingReturns) {
    for (const it of r.items) {
      const k = `${it.product}_${it.color || ""}_${it.size || ""}`;
      alreadyReturnedQty.set(k, (alreadyReturnedQty.get(k) || 0) + it.qty);
    }
  }

  const validatedItems = [];
  for (const it of items) {
    const orderItem = order.items.find(
      (oi) =>
        String(oi.product) === String(it.product) &&
        (oi.color || "") === (it.color || "") &&
        (oi.size || "") === (it.size || "")
    );
    if (!orderItem) {
      res.status(400);
      throw new Error("One of the requested items is not in this order");
    }
    const k = `${it.product}_${it.color || ""}_${it.size || ""}`;
    const remaining = orderItem.qty - (alreadyReturnedQty.get(k) || 0);
    const requestedQty = Number(it.qty) || 0;
    if (requestedQty < 1) {
      res.status(400);
      throw new Error("Quantity must be at least 1");
    }
    if (requestedQty > remaining) {
      res.status(400);
      throw new Error(
        `Only ${remaining} of "${orderItem.name}" can be returned`
      );
    }
    validatedItems.push({
      product: orderItem.product,
      name: orderItem.name,
      image: orderItem.image,
      color: orderItem.color,
      size: orderItem.size,
      qty: requestedQty,
      pricePaid: orderItem.price,
    });
  }

  const ret = await Return.create({
    order: order._id,
    user: order.user?._id || null,
    guestEmail: order.user
      ? undefined
      : order.guestEmail || guestEmail?.toLowerCase().trim(),
    type: type || "return",
    status: "requested",
    items: validatedItems,
    reason,
    notes,
    replacementRequest: type === "exchange" ? replacementRequest : undefined,
    statusHistory: [{ status: "requested", at: new Date(), by: req.user?._id }],
  });

  notifyCustomer(
    ret,
    order,
    `Return request received — order #${String(order._id).slice(-8)}`,
    `We've received your ${
      type === "exchange" ? "exchange" : "return"
    } request. We'll review it within 1-2 business days and let you know next steps.`
  );

  res.status(201).json(ret);
});

// GET /api/orders/:orderId/returns?email=...
const getReturnsForOrder = asyncHandler(async (req, res) => {
  const orderId = req.params.id;
  const { email } = req.query;

  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    res.status(404);
    throw new Error("Order not found");
  }

  const order = await Order.findById(orderId).select("user guestEmail");
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  if (!canActOnReturn(req, null, order.user, order.guestEmail, email)) {
    res.status(403);
    throw new Error("Not allowed");
  }
  const returns = await Return.find({ order: orderId }).sort({ createdAt: -1 });
  res.json(returns);
});

// GET /api/returns/mine — registered users only
const getMyReturns = asyncHandler(async (req, res) => {
  const returns = await Return.find({ user: req.user._id })
    .populate("order", "totalPrice createdAt")
    .sort({ createdAt: -1 });
  res.json(returns);
});

// PATCH /api/returns/:id/cancel — customer cancels their own request
const cancelReturn = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404);
    throw new Error("Return not found");
  }
  const ret = await Return.findById(req.params.id);
  if (!ret) {
    res.status(404);
    throw new Error("Return not found");
  }
  const order = await Order.findById(ret.order).select("user guestEmail");
  if (!canActOnReturn(req, ret, order?.user, order?.guestEmail, email)) {
    res.status(403);
    throw new Error("Not allowed");
  }
  if (!["requested", "approved"].includes(ret.status)) {
    res.status(400);
    throw new Error("This return cannot be cancelled at this stage");
  }
  ret.status = "cancelled";
  ret.statusHistory.push({
    status: "cancelled",
    at: new Date(),
    by: req.user?._id,
  });
  await ret.save();
  res.json(ret);
});

// ---------- Admin endpoints ----------

// GET /api/returns  (admin)  ?status=requested
const listReturns = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  const rows = await Return.find(filter)
    .populate("user", "name email")
    .populate("order", "totalPrice createdAt status")
    .sort({ createdAt: -1 });
  res.json(rows);
});

// PATCH /api/returns/:id  (admin)
// body: { action: 'approve'|'reject'|'received'|'refund'|'shipped_replacement', note?, refundAmount?, refundReference?, replacementOrderId?, returnTrackingNumber?, returnCourier? }
const adminUpdateReturn = asyncHandler(async (req, res) => {
  const {
    action,
    note,
    refundAmount,
    refundReference,
    replacementOrderId,
    returnTrackingNumber,
    returnCourier,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404);
    throw new Error("Return not found");
  }

  const ret = await Return.findById(req.params.id);
  if (!ret) {
    res.status(404);
    throw new Error("Return not found");
  }
  const order = await Order.findById(ret.order).populate("user", "name email");

  let nextStatus = null;
  switch (action) {
    case "approve":
      if (ret.status !== "requested") {
        res.status(400);
        throw new Error("Can only approve a requested return");
      }
      nextStatus = "approved";
      break;
    case "reject":
      if (ret.status !== "requested") {
        res.status(400);
        throw new Error("Can only reject a requested return");
      }
      if (!note?.trim()) {
        res.status(400);
        throw new Error("Please add a reason for rejection");
      }
      nextStatus = "rejected";
      break;
    case "received":
      if (ret.status !== "approved") {
        res.status(400);
        throw new Error("Item must be approved before marking as received");
      }
      nextStatus = "received";
      if (returnTrackingNumber !== undefined)
        ret.returnTrackingNumber = returnTrackingNumber;
      if (returnCourier !== undefined) ret.returnCourier = returnCourier;
      break;
    case "refund":
      if (ret.type !== "return") {
        res.status(400);
        throw new Error(
          "Only returns can be refunded — exchanges use shipped_replacement"
        );
      }
      if (ret.status !== "received") {
        res.status(400);
        throw new Error("Item must be received before refunding");
      }
      if (refundAmount == null || Number(refundAmount) <= 0) {
        res.status(400);
        throw new Error("refundAmount is required");
      }
      ret.refundAmount = Number(refundAmount);
      ret.refundReference = refundReference || undefined;
      ret.refundedAt = new Date();
      nextStatus = "refunded";
      break;
    case "shipped_replacement":
      if (ret.type !== "exchange") {
        res.status(400);
        throw new Error("Only exchanges use shipped_replacement");
      }
      if (ret.status !== "received") {
        res.status(400);
        throw new Error("Item must be received first");
      }
      if (replacementOrderId) ret.replacementOrder = replacementOrderId;
      nextStatus = "replacement_shipped";
      break;
    default:
      res.status(400);
      throw new Error("Unknown action");
  }

  ret.status = nextStatus;
  ret.statusHistory.push({
    status: nextStatus,
    at: new Date(),
    by: req.user._id,
    note,
  });
  await ret.save();

  // Customer notification
  const labels = {
    approved: `Your return has been approved — please ship the item back.`,
    rejected: `Your return has been declined. Reason: ${note}`,
    received: `We've received your returned item. We'll process it shortly.`,
    refunded: `Your refund of ${ret.refundAmount} has been initiated. ${
      refundReference ? `Reference: ${refundReference}.` : ""
    } It may take 5-7 business days to reflect.`,
    replacement_shipped: `Your replacement is on the way.`,
  };
  if (labels[nextStatus]) {
    notifyCustomer(
      ret,
      order,
      `Update on your return — order #${String(order._id).slice(-8)}`,
      labels[nextStatus]
    );
  }

  res.json(ret);
});

module.exports = {
  createReturn,
  getReturnsForOrder,
  getMyReturns,
  cancelReturn,
  listReturns,
  adminUpdateReturn,
};
