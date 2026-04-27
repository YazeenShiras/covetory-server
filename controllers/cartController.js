const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Product = require("../models/Product");

// GET /api/cart/mine — restore cart on login
const getMyCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) return res.json({ items: [] });
  res.json({ items: cart.items, updatedAt: cart.updatedAt });
});

// POST /api/cart — sync from client. Replaces the cart entirely.
// body: { items: [{ product, qty, color?, size? }] }
const syncCart = asyncHandler(async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    res.status(400);
    throw new Error("items must be an array");
  }

  // Validate + snapshot prices server-side. We don't trust client price/name.
  const validated = [];
  for (const it of items) {
    if (!it?.product || !mongoose.Types.ObjectId.isValid(it.product)) continue;
    const qty = Math.max(1, Math.min(99, Number(it.qty) || 1));
    const product = await Product.findById(it.product).select(
      "name price images colors hsn"
    );
    if (!product) continue;
    const colorImg = product.colors?.find((c) => c.name === it.color)
      ?.images?.[0]?.url;
    const image = colorImg || product.images?.[0]?.url;
    validated.push({
      product: product._id,
      qty,
      color: it.color || undefined,
      size: it.size || undefined,
      name: product.name,
      price: product.price,
      image,
    });
  }

  const cart = await Cart.findOneAndUpdate(
    { user: req.user._id },
    {
      $set: { items: validated, updatedAt: new Date() },
      $unset: { abandonedAt: 1, recoveryEmailSentAt: 1 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.json({ items: cart.items, updatedAt: cart.updatedAt });
});

// DELETE /api/cart — clear (called after successful order)
const clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndUpdate(
    { user: req.user._id },
    { $set: { items: [] }, $unset: { abandonedAt: 1, recoveryEmailSentAt: 1 } },
    { new: true, upsert: true }
  );
  res.json({ ok: true });
});

module.exports = { getMyCart, syncCart, clearCart };
