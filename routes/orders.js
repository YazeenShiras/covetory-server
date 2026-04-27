const router = require("express").Router();
const {
  createOrder,
  getMyOrders,
  getOrder,
  getAllOrders,
  updateOrderStatus,
  lookupOrder,
  downloadInvoice,
} = require("../controllers/orderController");
const { getReturnsForOrder } = require("../controllers/returnController");
const { protect, admin, optionalAuth } = require("../middleware/auth");

router.post("/", optionalAuth, createOrder);
router.post("/lookup", lookupOrder);
router.get("/mine", protect, getMyOrders);
router.get("/", protect, admin, getAllOrders);
router.get("/:id/invoice", optionalAuth, downloadInvoice);
router.get("/:id/returns", optionalAuth, getReturnsForOrder);
router.get("/:id", protect, getOrder);
router.put("/:id/status", protect, admin, updateOrderStatus);

module.exports = router;
