const router = require("express").Router();
const {
  createReturn,
  getMyReturns,
  cancelReturn,
  listReturns,
  adminUpdateReturn,
} = require("../controllers/returnController");
const { protect, admin, optionalAuth } = require("../middleware/auth");

// NOTE: GET /api/orders/:id/returns is mounted in routes/orders.js, not here.
// This router only handles /api/returns/* paths.

// Customer
router.post("/", optionalAuth, createReturn); // create — guest or user
router.get("/mine", protect, getMyReturns);
router.patch("/:id/cancel", optionalAuth, cancelReturn); // owner cancels

// Admin
router.get("/", protect, admin, listReturns);
router.patch("/:id", protect, admin, adminUpdateReturn);

module.exports = router;
