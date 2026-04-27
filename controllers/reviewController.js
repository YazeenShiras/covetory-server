const asyncHandler = require("express-async-handler");
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");

// Recompute and persist product.rating + numReviews
async function recalcProductRating(productId) {
  const rows = await Review.find({ product: productId, hidden: false });
  const num = rows.length;
  const avg = num === 0 ? 0 : rows.reduce((s, r) => s + r.rating, 0) / num;
  await Product.findByIdAndUpdate(productId, {
    rating: +avg.toFixed(2),
    numReviews: num,
  });
}

// GET /api/products/:id/reviews
// Public. Hidden reviews are excluded.
const listReviews = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reviews = await Review.find({ product: id, hidden: false })
    .sort({ createdAt: -1 })
    .lean();

  // Distribution for the breakdown widget
  const breakdown = [0, 0, 0, 0, 0];
  for (const r of reviews) breakdown[r.rating - 1]++;
  const total = reviews.length;
  const average =
    total === 0 ? 0 : reviews.reduce((s, r) => s + r.rating, 0) / total;

  res.json({
    reviews,
    summary: {
      total,
      average: +average.toFixed(2),
      breakdown, // [one-star count, two, three, four, five]
    },
  });
});

// GET /api/products/:id/reviews/can-review
// Protected. Tells the frontend if the current user can leave a review
// (has bought + received, hasn't already reviewed).
const canReview = asyncHandler(async (req, res) => {
  const { id: productId } = req.params;
  const userId = req.user._id;

  const existing = await Review.findOne({ product: productId, user: userId });
  if (existing)
    return res.json({ canReview: false, reason: "already-reviewed", existing });

  // Has this user received this product?
  const delivered = await Order.findOne({
    user: userId,
    status: "delivered",
    "items.product": productId,
  });

  if (!delivered)
    return res.json({ canReview: false, reason: "not-purchased" });
  res.json({ canReview: true, verifiedPurchase: true });
});

// POST /api/products/:id/reviews
// body: { rating, title, body }
const createReview = asyncHandler(async (req, res) => {
  const { id: productId } = req.params;
  const { rating, title, body } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    res.status(400);
    throw new Error("Rating must be between 1 and 5");
  }

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error("Product not found");
  }

  // Duplicate guard
  const existing = await Review.findOne({
    product: productId,
    user: req.user._id,
  });
  if (existing) {
    res.status(400);
    throw new Error("You already reviewed this product");
  }

  // Verified-purchase check
  const delivered = await Order.findOne({
    user: req.user._id,
    status: "delivered",
    "items.product": productId,
  });
  if (!delivered) {
    res.status(403);
    throw new Error(
      "Only customers who have received this item can leave a review"
    );
  }

  const review = await Review.create({
    product: productId,
    user: req.user._id,
    userName: req.user.name,
    rating,
    title,
    body,
    verifiedPurchase: true,
  });

  await recalcProductRating(productId);
  res.status(201).json(review);
});

// DELETE /api/reviews/:id — owner or admin
const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) {
    res.status(404);
    throw new Error("Review not found");
  }
  if (!req.user.isAdmin && String(review.user) !== String(req.user._id)) {
    res.status(403);
    throw new Error("Not allowed");
  }
  const productId = review.product;
  await review.deleteOne();
  await recalcProductRating(productId);
  res.json({ message: "Review deleted" });
});

// PUT /api/reviews/:id/hide — admin
const toggleHideReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) {
    res.status(404);
    throw new Error("Review not found");
  }
  review.hidden = !review.hidden;
  await review.save();
  await recalcProductRating(review.product);
  res.json(review);
});

// GET /api/reviews — admin (all reviews, hidden included)
const listAllReviewsAdmin = asyncHandler(async (_req, res) => {
  const reviews = await Review.find({})
    .populate("product", "name")
    .populate("user", "name email")
    .sort({ createdAt: -1 });
  res.json(reviews);
});

module.exports = {
  listReviews,
  canReview,
  createReview,
  deleteReview,
  toggleHideReview,
  listAllReviewsAdmin,
};
