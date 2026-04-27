const router = require("express").Router();
const {
  ingestEvent,
  revenueByDay,
  topProducts,
  conversionFunnel,
} = require("../controllers/analyticsController");
const { protect, admin, optionalAuth } = require("../middleware/auth");

// Public ingest — anyone can fire events. Rate-limited per session inside the controller.
router.post("/events", optionalAuth, ingestEvent);

// Admin reads
router.get("/analytics/revenue", protect, admin, revenueByDay);
router.get("/analytics/top-products", protect, admin, topProducts);
router.get("/analytics/funnel", protect, admin, conversionFunnel);

module.exports = router;
