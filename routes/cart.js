const router = require("express").Router();
const {
  getMyCart,
  syncCart,
  clearCart,
} = require("../controllers/cartController");
const { protect } = require("../middleware/auth");

router.get("/mine", protect, getMyCart);
router.post("/", protect, syncCart);
router.delete("/", protect, clearCart);

module.exports = router;
