const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const Order = require("../models/Order");

// Simple in-memory rate limiter — keyed by session, max 1 event/sec.
// Good enough for a small store; replace with Redis if you ever scale.
const rateBucket = new Map();
const RATE_WINDOW_MS = 1000;
const RATE_MAX = 1;

function rateLimited(key) {
  const now = Date.now();
  const last = rateBucket.get(key) || [];
  const recent = last.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) return true;
  recent.push(now);
  rateBucket.set(key, recent);
  // Crude bucket cleanup
  if (rateBucket.size > 5000) {
    for (const [k, ts] of rateBucket) {
      if (now - Math.max(...ts) > 60000) rateBucket.delete(k);
    }
  }
  return false;
}

// POST /api/events — public, optionally authed
// body: { type, productId?, sessionId }
const ingestEvent = asyncHandler(async (req, res) => {
  const { type, productId, sessionId } = req.body || {};
  if (!Event.TYPES.includes(type)) {
    res.status(400);
    throw new Error("Invalid event type");
  }
  if (!sessionId || typeof sessionId !== "string" || sessionId.length < 8) {
    res.status(400);
    throw new Error("Invalid sessionId");
  }
  if (rateLimited(`${sessionId}:${type}`)) {
    return res.status(204).end();
  }
  let normalisedProductId = null;
  if (productId) {
    try {
      normalisedProductId = new mongoose.Types.ObjectId(productId);
    } catch (_) {
      // ignore — productId is optional
    }
  }
  await Event.create({
    type,
    productId: normalisedProductId,
    sessionId,
    user: req.user?._id || null,
  });
  res.status(204).end();
});

// ---------------- Admin analytics ----------------

// GET /api/analytics/revenue?days=30   (admin)
// Returns: [{ date: 'YYYY-MM-DD', revenue, orders }]
const revenueByDay = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Only count paid orders for revenue. (COD orders that haven't been delivered
  // are pending revenue, not realised — change to {} if you want them included.)
  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, isPaid: true } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$totalPrice" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill in missing days so the chart has a continuous x-axis
  const byDate = new Map(
    rows.map((r) => [r._id, { revenue: r.revenue, orders: r.orders }])
  );
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const v = byDate.get(key) || { revenue: 0, orders: 0 };
    out.push({ date: key, revenue: +v.revenue.toFixed(2), orders: v.orders });
  }

  // Totals for KPI cards
  const totalRevenue = out.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = out.reduce((s, r) => s + r.orders, 0);
  const avgOrderValue = totalOrders === 0 ? 0 : totalRevenue / totalOrders;

  res.json({
    days,
    series: out,
    totals: {
      revenue: +totalRevenue.toFixed(2),
      orders: totalOrders,
      avgOrderValue: +avgOrderValue.toFixed(2),
    },
  });
});

// GET /api/analytics/top-products?days=30&limit=8   (admin)
const topProducts = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 24);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, isPaid: true } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        name: { $first: "$items.name" },
        unitsSold: { $sum: "$items.qty" },
        revenue: { $sum: { $multiply: ["$items.price", "$items.qty"] } },
        orderCount: { $sum: 1 },
      },
    },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        unitsSold: 1,
        revenue: 1,
        orderCount: 1,
        category: { $arrayElemAt: ["$product.category", 0] },
        image: {
          $ifNull: [
            { $arrayElemAt: [{ $arrayElemAt: ["$product.images.url", 0] }, 0] },
            {
              $arrayElemAt: [
                {
                  $arrayElemAt: [
                    { $arrayElemAt: ["$product.colors.images.url", 0] },
                    0,
                  ],
                },
                0,
              ],
            },
          ],
        },
      },
    },
  ]);

  // round revenue
  for (const r of rows) r.revenue = +Number(r.revenue || 0).toFixed(2);
  res.json(rows);
});

// GET /api/analytics/funnel?days=30   (admin)
// Distinct sessions per stage; last stage uses paid orders.
const conversionFunnel = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const stagesAgg = await Event.aggregate([
    {
      $match: {
        ts: { $gte: since },
        type: { $in: ["view", "add_to_cart", "checkout_started"] },
      },
    },
    { $group: { _id: { type: "$type", sessionId: "$sessionId" } } },
    { $group: { _id: "$_id.type", count: { $sum: 1 } } },
  ]);

  const stageCounts = stagesAgg.reduce((a, r) => ({ ...a, [r._id]: r.count }), {
    view: 0,
    add_to_cart: 0,
    checkout_started: 0,
  });

  const paid = await Order.countDocuments({
    createdAt: { $gte: since },
    isPaid: true,
  });

  // Build a clean funnel array for the chart
  const funnel = [
    { stage: "Viewed product", key: "view", count: stageCounts.view },
    {
      stage: "Added to bag",
      key: "add_to_cart",
      count: stageCounts.add_to_cart,
    },
    {
      stage: "Started checkout",
      key: "checkout_started",
      count: stageCounts.checkout_started,
    },
    { stage: "Paid", key: "paid", count: paid },
  ];

  // Compute conversion percentages relative to top-of-funnel
  const top = funnel[0].count || 0;
  for (const step of funnel) {
    step.conversionFromTop =
      top === 0 ? 0 : +((step.count / top) * 100).toFixed(1);
  }
  // Step-over-step rate (% of previous stage)
  for (let i = 0; i < funnel.length; i++) {
    const prev = i === 0 ? funnel[0].count : funnel[i - 1].count;
    funnel[i].stepRate =
      prev === 0 ? 0 : +((funnel[i].count / prev) * 100).toFixed(1);
  }

  res.json({ days, funnel });
});

module.exports = {
  ingestEvent,
  revenueByDay,
  topProducts,
  conversionFunnel,
};
