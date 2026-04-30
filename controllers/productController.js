const asyncHandler = require("express-async-handler");
const Product = require("../models/Product");
const { cloudinary } = require("../config/cloudinary");
const { inventorySummary, analyseStock } = require("../utils/inventory");

// GET /api/products  (supports ?q=&category=&featured=&page=&limit=&stock=low|out)
const getProducts = asyncHandler(async (req, res) => {
  const { q, category, featured, stock } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 12, 60);

  const filter = {};
  if (category && category !== "all") filter.category = category;
  if (featured === "true") filter.featured = true;

  let query;
  let sort = { createdAt: -1 };

  if (q && q.trim()) {
    const term = q.trim();
    const textFilter = { ...filter, $text: { $search: term } };
    const textHits = await Product.countDocuments(textFilter);

    if (textHits > 0) {
      query = Product.find(textFilter, { score: { $meta: "textScore" } });
      sort = { score: { $meta: "textScore" } };
    } else {
      const regex = {
        $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
      query = Product.find({
        ...filter,
        $or: [{ name: regex }, { category: regex }],
      });
    }
  } else {
    query = Product.find(filter);
  }

  // Stock filter is applied post-fetch because variant analysis isn't expressible
  // as a Mongo query without an aggregation pipeline. For shops up to ~10k SKUs
  // this is fine; beyond that, switch to aggregation.
  if (stock === "low" || stock === "out") {
    const all = await query.sort(sort);
    const filtered = all.filter((p) => analyseStock(p).status === stock);
    const total = filtered.length;
    const sliced = filtered.slice((page - 1) * limit, page * limit);
    const products = sliced.map((p) => ({
      ...p.toObject(),
      inventory: inventorySummary(p),
    }));
    return res.json({ products, page, pages: Math.ceil(total / limit), total });
  }

  const total = await Product.countDocuments(query.getFilter());
  const docs = await query
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);
  const products = docs.map((p) => ({
    ...p.toObject(),
    inventory: inventorySummary(p),
  }));

  res.json({ products, page, pages: Math.ceil(total / limit), total });
});

// GET /api/products/search/suggest?q=linen
// Lightweight autocomplete endpoint — returns just what the dropdown needs
const suggestProducts = asyncHandler(async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ products: [], categories: [] });

  const regex = {
    $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    $options: "i",
  };

  const [products, categories] = await Promise.all([
    Product.find({ $or: [{ name: regex }, { category: regex }] })
      .select("name category price images colors rating numReviews")
      .limit(6)
      .lean(),
    Product.distinct("category", { category: regex }).then((cats) =>
      cats.slice(0, 4)
    ),
  ]);

  res.json({ products, categories });
});

// GET /api/products/categories
const getCategories = asyncHandler(async (_req, res) => {
  const categories = await Product.distinct("category");
  res.json(categories);
});

// GET /api/products/:id
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  res.json(product);
});

// POST /api/products  (admin)
const createProduct = asyncHandler(async (req, res) => {
  const body = req.body;
  const product = await Product.create(body);
  res.status(201).json(product);
});

// PUT /api/products/:id  (admin)
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  const fields = [
    "name",
    "description",
    "price",
    "compareAtPrice",
    "category",
    "images",
    "colors",
    "sizes",
    "stock",
    "featured",
    "variantStock",
    "lowStockThreshold",
    "hsn",
  ];
  for (const f of fields) {
    if (f in req.body) product[f] = req.body[f];
  }
  // variantStock is a Mixed field — Mongoose won't detect nested changes otherwise
  if ("variantStock" in req.body) product.markModified("variantStock");
  await product.save();
  res.json(product);
});

// DELETE /api/products/:id  (admin)
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }
  // Best-effort remove of Cloudinary assets (legacy + per-color)
  const allImages = [
    ...(product.images || []),
    ...(product.colors || []).flatMap((c) => c.images || []),
  ];
  for (const img of allImages) {
    if (img.publicId) {
      try {
        await cloudinary.uploader.destroy(img.publicId);
      } catch (_) {}
    }
  }
  await product.deleteOne();
  res.json({ message: "Product deleted" });
});

// POST /api/products/bulk  (admin)
// body: { ids: [string], action, payload? }
// actions:
//   'delete'        — remove products + cloudinary assets
//   'feature_on'    — set featured: true
//   'feature_off'   — set featured: false
//   'set_price'     — payload.value (rupees); applies as flat price to all
//   'discount'      — payload.percent (0-95); reduces price by % rounded to nearest 50
const bulkAction = asyncHandler(async (req, res) => {
  const mongoose = require("mongoose");
  const { ids, action, payload = {} } = req.body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400);
    throw new Error("ids must be a non-empty array");
  }
  if (ids.length > 200) {
    res.status(400);
    throw new Error("Bulk operations are limited to 200 items at a time");
  }
  // Reject invalid ObjectIds early so a typo can't crash the whole batch
  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validIds.length === 0) {
    res.status(400);
    throw new Error("No valid product IDs");
  }

  let result;
  switch (action) {
    case "delete": {
      const products = await Product.find({ _id: { $in: validIds } });
      const allImages = products.flatMap((p) => [
        ...(p.images || []),
        ...(p.colors || []).flatMap((c) => c.images || []),
      ]);
      // Cloudinary cleanup is best-effort
      for (const img of allImages) {
        if (img.publicId) {
          try {
            await cloudinary.uploader.destroy(img.publicId);
          } catch (_) {}
        }
      }
      const r = await Product.deleteMany({ _id: { $in: validIds } });
      result = { deleted: r.deletedCount };
      break;
    }

    case "feature_on":
    case "feature_off": {
      const r = await Product.updateMany(
        { _id: { $in: validIds } },
        { $set: { featured: action === "feature_on" } }
      );
      result = { matched: r.matchedCount, modified: r.modifiedCount };
      break;
    }

    case "set_price": {
      const value = Number(payload.value);
      if (!isFinite(value) || value < 0) {
        res.status(400);
        throw new Error("payload.value must be a positive number");
      }
      const r = await Product.updateMany(
        { _id: { $in: validIds } },
        { $set: { price: +value.toFixed(2) } }
      );
      result = { matched: r.matchedCount, modified: r.modifiedCount };
      break;
    }

    case "discount": {
      const percent = Number(payload.percent);
      if (!isFinite(percent) || percent <= 0 || percent >= 100) {
        res.status(400);
        throw new Error("payload.percent must be between 0 and 100");
      }
      // Discount per-product so each maintains its own price relationship.
      const products = await Product.find({ _id: { $in: validIds } });
      let modified = 0;
      for (const p of products) {
        const original = p.compareAtPrice || p.price;
        const discounted =
          Math.round((original * (1 - percent / 100)) / 50) * 50; // round to ₹50
        // Save original as compareAtPrice so the storefront shows strike-through
        if (!p.compareAtPrice) p.compareAtPrice = p.price;
        p.price = Math.max(50, discounted);
        await p.save();
        modified++;
      }
      result = { modified };
      break;
    }

    case "remove_discount": {
      // Restore price to compareAtPrice and clear it
      const products = await Product.find({
        _id: { $in: validIds },
        compareAtPrice: { $gt: 0 },
      });
      let modified = 0;
      for (const p of products) {
        p.price = p.compareAtPrice;
        p.compareAtPrice = undefined;
        await p.save();
        modified++;
      }
      result = { modified };
      break;
    }

    default:
      res.status(400);
      throw new Error(`Unknown action: ${action}`);
  }

  res.json({ ok: true, action, ...result });
});

// GET /api/products/:id/related
// Returns up to 8 products in the same category, excluding current.
// Falls back to other featured products if the category is thin.
const relatedProducts = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = Math.min(Number(req.query.limit) || 8, 12);

  const current = await Product.findById(id).select("category");
  if (!current) {
    res.status(404);
    throw new Error("Product not found");
  }

  let products = await Product.find({
    _id: { $ne: id },
    category: current.category,
  })
    .select(
      "name category price compareAtPrice images colors rating numReviews"
    )
    .limit(limit)
    .lean();

  // Top up with featured products from other categories if thin
  if (products.length < limit) {
    const have = new Set(products.map((p) => String(p._id)));
    const topUp = await Product.find({
      _id: { $ne: id, $nin: Array.from(have) },
      featured: true,
    })
      .select(
        "name category price compareAtPrice images colors rating numReviews"
      )
      .limit(limit - products.length)
      .lean();
    products = [...products, ...topUp];
  }

  res.json(products);
});

// GET /api/products/:id/frequently-bought
// Finds other products that appear alongside this one in past orders,
// ranked by how often they co-occur.
const frequentlyBought = asyncHandler(async (req, res) => {
  const Order = require("../models/Order");
  const { id } = req.params;
  const mongoose = require("mongoose");
  const limit = Math.min(Number(req.query.limit) || 6, 12);

  let objectId;
  try {
    objectId = new mongoose.Types.ObjectId(id);
  } catch (_) {
    res.status(400);
    throw new Error("Invalid product id");
  }

  // Aggregate: find orders containing this product, then count co-occurring products
  const rows = await Order.aggregate([
    { $match: { "items.product": objectId } },
    { $unwind: "$items" },
    { $match: { "items.product": { $ne: objectId } } },
    {
      $group: {
        _id: "$items.product",
        count: { $sum: 1 },
        totalQty: { $sum: "$items.qty" },
      },
    },
    { $sort: { count: -1, totalQty: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: ["$product", { coOccurrenceCount: "$count" }],
        },
      },
    },
    {
      $project: {
        name: 1,
        category: 1,
        price: 1,
        compareAtPrice: 1,
        images: 1,
        colors: 1,
        rating: 1,
        numReviews: 1,
        coOccurrenceCount: 1,
      },
    },
  ]);

  res.json(rows);
});

module.exports = {
  getProducts,
  getCategories,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  suggestProducts,
  relatedProducts,
  frequentlyBought,
  bulkAction,
};
