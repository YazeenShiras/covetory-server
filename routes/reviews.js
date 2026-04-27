const router = require("express").Router();
const {
  listReviews,
  canReview,
  createReview,
  deleteReview,
  toggleHideReview,
  listAllReviewsAdmin,
} = require("../controllers/reviewController");
const { protect, admin } = require("../middleware/auth");

// Per-product endpoints mounted at /api/products/:id/reviews
const productReviews = require("express").Router({ mergeParams: true });
productReviews.get("/", listReviews);
productReviews.get("/can-review", protect, canReview);
productReviews.post("/", protect, createReview);

// Flat /api/reviews endpoints
router.get("/", protect, admin, listAllReviewsAdmin);
router.delete("/:id", protect, deleteReview);
router.put("/:id/hide", protect, admin, toggleHideReview);

module.exports = { router, productReviews };
