const router = require("express").Router();
const {
  getUsers,
  updateProfile,
  changePassword,
  deleteMe,
  getWishlist,
  toggleWishlist,
  deleteUser,
  toggleAdmin,
  enableWishlistShare,
  disableWishlistShare,
} = require("../controllers/userController");
const { protect, admin } = require("../middleware/auth");

// self endpoints
router.put("/profile", protect, updateProfile);
router.put("/password", protect, changePassword);
router.delete("/me", protect, deleteMe);
router.get("/wishlist", protect, getWishlist);
router.post("/wishlist/share", protect, enableWishlistShare);
router.delete("/wishlist/share", protect, disableWishlistShare);
router.post("/wishlist/:productId", protect, toggleWishlist);

// admin endpoints
router.get("/", protect, admin, getUsers);
router.delete("/:id", protect, admin, deleteUser);
router.put("/:id/admin", protect, admin, toggleAdmin);

module.exports = router;
