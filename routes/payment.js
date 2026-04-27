const router = require("express").Router();
const {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getPaymentConfig,
} = require("../controllers/paymentController");
const { optionalAuth } = require("../middleware/auth");

router.get("/config", getPaymentConfig);
router.post("/razorpay/order", optionalAuth, createRazorpayOrder);
router.post("/razorpay/verify", optionalAuth, verifyRazorpayPayment);

module.exports = router;
