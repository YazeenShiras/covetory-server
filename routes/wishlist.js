const router = require("express").Router();
const { getSharedWishlist } = require("../controllers/userController");

// Public — anyone with the token can read the shared wishlist
router.get("/:token", getSharedWishlist);

module.exports = router;
