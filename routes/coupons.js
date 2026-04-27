const router = require("express").Router();
const {
  validate,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require("../controllers/couponController");
const { protect, admin, optionalAuth } = require("../middleware/auth");

router.post("/validate", optionalAuth, validate); // public — anyone can check a code
router.get("/", protect, admin, listCoupons);
router.post("/", protect, admin, createCoupon);
router.put("/:id", protect, admin, updateCoupon);
router.delete("/:id", protect, admin, deleteCoupon);

module.exports = router;
