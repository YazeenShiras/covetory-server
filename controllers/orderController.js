const asyncHandler = require("express-async-handler");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");
const Coupon = require("../models/Coupon");
const Counter = require("../models/Counter");
const { validateCoupon } = require("../utils/validateCoupon");
const {
  financialYearOf,
  counterScopeForFY,
  formatInvoiceNumber,
  splitTax,
} = require("../utils/invoiceHelpers");
const { sendEmail } = require("../config/email");
const templates = require("../utils/emailTemplates");

// POST /api/orders
const createOrder = asyncHandler(async (req, res) => {
  const {
    items,
    shippingAddress,
    paymentMethod,
    guestEmail,
    guestName,
    couponCode,
    buyerGstin,
  } = req.body;
  if (!items || items.length === 0) {
    res.status(400);
    throw new Error("No items in order");
  }

  // Identity — either an authenticated user or a valid guest email
  const isGuest = !req.user;
  if (isGuest) {
    if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
      res.status(400);
      throw new Error("A valid email is required for guest checkout");
    }
  }

  // Re-price items server-side to prevent tampering
  let itemsPrice = 0;
  const priced = [];
  for (const it of items) {
    const product = await Product.findById(it.product);
    if (!product) {
      res.status(400);
      throw new Error(`Product not found: ${it.product}`);
    }

    // Validate variant picks against the product
    if (product.colors?.length > 0) {
      if (!it.color) {
        res.status(400);
        throw new Error(`Please select a color for "${product.name}"`);
      }
      const colorMatch = product.colors.find((c) => c.name === it.color);
      if (!colorMatch) {
        res.status(400);
        throw new Error(`Invalid color "${it.color}" for "${product.name}"`);
      }
    }
    if (product.sizes?.length > 0) {
      if (!it.size) {
        res.status(400);
        throw new Error(`Please select a size for "${product.name}"`);
      }
      if (!product.sizes.includes(it.size)) {
        res.status(400);
        throw new Error(`Invalid size "${it.size}" for "${product.name}"`);
      }
    }

    // Check available stock for the chosen variant (or fallback to total stock)
    const available = product.stockFor(it.color, it.size);
    if (available < it.qty) {
      res.status(400);
      throw new Error(`Only ${available} left for "${product.name}"`);
    }

    // Prefer the chosen color's first image if present
    const colorImg = product.colors?.find((c) => c.name === it.color)
      ?.images?.[0]?.url;
    const image = colorImg || product.images?.[0]?.url;

    itemsPrice += product.price * it.qty;
    priced.push({
      product: product._id,
      name: product.name,
      image,
      price: product.price,
      qty: it.qty,
      color: it.color || undefined,
      size: it.size || undefined,
      hsn: product.hsn || undefined, // snapshot for tax invoice
    });
  }

  const shippingPrice = itemsPrice > 2000 ? 0 : 99;
  const taxPrice = +(itemsPrice * 0.18).toFixed(2);

  // Apply coupon (re-validated server-side so it can't be tampered with)
  let discountPrice = 0;
  let appliedCoupon = null;
  if (couponCode) {
    try {
      const { coupon, discount } = await validateCoupon({
        code: couponCode,
        subtotal: itemsPrice,
        userId: req.user?._id || null,
      });
      discountPrice = discount;
      appliedCoupon = coupon;
    } catch (err) {
      res.status(err.status || 400);
      throw err;
    }
  }

  const totalPrice = +(
    itemsPrice +
    shippingPrice +
    taxPrice -
    discountPrice
  ).toFixed(2);

  // Invoice number (sequential per financial year, scoped to avoid collisions)
  const invoiceDate = new Date();
  const fy = financialYearOf(invoiceDate);
  const seq = await Counter.next(counterScopeForFY(fy));
  const invoiceNumber = formatInvoiceNumber(fy, seq);

  // Tax split — CGST+SGST for intra-state, IGST for inter-state
  const taxBreakdown = splitTax({
    taxAmount: taxPrice,
    sellerStateCode: process.env.SELLER_STATE_CODE,
    sellerStateName: process.env.SELLER_STATE,
    buyerGstin: buyerGstin || null,
    buyerState: shippingAddress?.state,
  });

  const order = await Order.create({
    user: req.user?._id || null,
    guestEmail: isGuest ? guestEmail.toLowerCase() : undefined,
    guestName: isGuest ? guestName || shippingAddress?.name : undefined,
    items: priced,
    shippingAddress,
    paymentMethod: paymentMethod || "cod",
    itemsPrice,
    shippingPrice,
    taxPrice,
    discountPrice,
    couponCode: appliedCoupon?.code,
    totalPrice,
    currency: "INR",
    invoiceNumber,
    invoiceDate,
    buyerGstin: buyerGstin
      ? String(buyerGstin).toUpperCase().trim()
      : undefined,
    taxBreakdown,
  });

  // Record coupon usage AFTER order creation so a failed order doesn't consume it
  if (appliedCoupon) {
    appliedCoupon.usedCount = (appliedCoupon.usedCount || 0) + 1;
    if (req.user) {
      appliedCoupon.usedBy = [...(appliedCoupon.usedBy || []), req.user._id];
    }
    await appliedCoupon.save();
  }

  // Decrement stock — per-variant when available, else total stock
  for (const it of priced) {
    const product = await Product.findById(it.product);
    if (!product) continue;
    const vs = product.variantStock;
    const hasVariantStock = vs && Object.keys(vs).length > 0;
    if (hasVariantStock && (it.color || it.size)) {
      const key = `${it.color || ""}__${it.size || ""}`;
      const current = vs[key] ?? 0;
      product.variantStock = { ...vs, [key]: Math.max(0, current - it.qty) };
      product.markModified("variantStock");
      product.stock = Math.max(0, product.stock - it.qty);
      await product.save();
    } else {
      await Product.findByIdAndUpdate(it.product, { $inc: { stock: -it.qty } });
    }
  }

  // Order confirmation email + invoice attachment (best effort — never blocks the response)
  const recipientEmail = req.user?.email || order.guestEmail;
  const recipientName =
    req.user?.name || order.guestName || shippingAddress?.name || "";
  if (recipientEmail) {
    (async () => {
      let attachments = [];
      try {
        const {
          renderInvoiceToBuffer,
        } = require("../utils/renderInvoiceToBuffer");
        // Populate user so buyer-name on the invoice is correct
        const populated = await Order.findById(order._id).populate(
          "user",
          "name email"
        );
        const buffer = await renderInvoiceToBuffer(populated);
        attachments = [
          {
            filename: `${populated.invoiceNumber.replace(
              /[^A-Z0-9._-]/gi,
              "_"
            )}.pdf`,
            content: buffer,
          },
        ];
      } catch (err) {
        console.warn(
          "[email] invoice render failed, sending without attachment:",
          err?.message
        );
      }
      sendEmail({
        to: recipientEmail,
        ...templates.orderConfirmation({ name: recipientName, order }),
        attachments,
      });
    })();
  }

  res.status(201).json(order);
});

// GET /api/orders/mine
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  res.json(orders);
});

// GET /api/orders/:id  (auth required — registered owner or admin)
const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    "user",
    "name email"
  );
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  // only owner or admin
  const isOwner = order.user && String(order.user._id) === String(req.user._id);
  if (!req.user.isAdmin && !isOwner) {
    res.status(403);
    throw new Error("Not allowed");
  }
  res.json(order);
});

// POST /api/orders/lookup
// Public endpoint for guest customers: { orderId, email } -> order
const lookupOrder = asyncHandler(async (req, res) => {
  const { orderId, email } = req.body;
  if (!orderId || !email) {
    res.status(400);
    throw new Error("Order ID and email are required");
  }
  let order;
  try {
    order = await Order.findById(orderId).populate("user", "name email");
  } catch (_) {
    res.status(404);
    throw new Error("Order not found");
  }
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  const cleanEmail = String(email).toLowerCase().trim();
  const registeredMatch = order.user?.email?.toLowerCase() === cleanEmail;
  const guestMatch = order.guestEmail?.toLowerCase() === cleanEmail;
  if (!registeredMatch && !guestMatch) {
    // uniform response — don't reveal whether the order exists
    res.status(404);
    throw new Error(
      "We couldn't find that order. Double-check the number and email."
    );
  }
  res.json(order);
});

// GET /api/orders  (admin)
const getAllOrders = asyncHandler(async (_req, res) => {
  const orders = await Order.find({})
    .populate("user", "name email")
    .sort({ createdAt: -1 });
  res.json(orders);
});

// PUT /api/orders/:id/status  (admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, isPaid, trackingNumber, trackingUrl, courier, adminNote } =
    req.body;
  const order = await Order.findById(req.params.id).populate(
    "user",
    "name email"
  );
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  const prevStatus = order.status;

  if (status) order.status = status;
  if (typeof isPaid === "boolean") {
    order.isPaid = isPaid;
    if (isPaid && !order.paidAt) order.paidAt = new Date();
  }
  if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
  if (trackingUrl !== undefined) order.trackingUrl = trackingUrl;
  if (courier !== undefined) order.courier = courier;
  if (adminNote !== undefined) order.adminNote = adminNote;

  // Append a status-history entry when status changes
  if (status && status !== prevStatus) {
    order.statusHistory = [
      ...(order.statusHistory || []),
      { status, at: new Date() },
    ];
  }

  await order.save();

  // Email customer on status change (not on tracking-only edits)
  if (status && status !== prevStatus) {
    const recipient = order.user?.email || order.guestEmail;
    const displayName = order.user?.name || order.guestName || "there";
    if (recipient) {
      sendEmail({
        to: recipient,
        ...templates.orderStatusUpdate({
          name: displayName,
          order,
          newStatus: status,
          trackingNumber: order.trackingNumber,
          trackingUrl: order.trackingUrl,
        }),
      });
    }
  }

  res.json(order);
});

// GET /api/orders/:id/invoice — streams the PDF
// Registered owner, admin, or guest with matching email (via ?email=...)
const downloadInvoice = asyncHandler(async (req, res) => {
  const { renderInvoice } = require("../utils/invoicePdf");
  const order = await Order.findById(req.params.id).populate(
    "user",
    "name email"
  );
  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }
  if (!order.invoiceNumber) {
    res.status(400);
    throw new Error("Invoice is not available for this order yet");
  }

  // Access: registered owner, admin, or matching guest email via query
  const email = String(req.query.email || "")
    .toLowerCase()
    .trim();
  const isOwner =
    req.user && order.user && String(order.user._id) === String(req.user._id);
  const isAdmin = req.user && req.user.isAdmin;
  const guestMatch =
    !!email &&
    ((order.guestEmail && order.guestEmail.toLowerCase() === email) ||
      (order.user?.email && order.user.email.toLowerCase() === email));
  if (!isOwner && !isAdmin && !guestMatch) {
    res.status(403);
    throw new Error("Not allowed");
  }

  const safeName = order.invoiceNumber.replace(/[^A-Z0-9._-]/gi, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeName}.pdf"`);
  await renderInvoice(order, res);
});

module.exports = {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
  lookupOrder,
  downloadInvoice,
};
