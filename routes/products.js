const router = require("express").Router();
const {
  getProducts,
  getCategories,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  suggestProducts,
  relatedProducts,
  frequentlyBought,
} = require("../controllers/productController");
const { protect, admin } = require("../middleware/auth");

router.get("/", getProducts);
router.get("/categories", getCategories);
router.get("/search/suggest", suggestProducts);
router.get("/:id/related", relatedProducts);
router.get("/:id/frequently-bought", frequentlyBought);
router.get("/:id", getProduct);
router.post("/", protect, admin, createProduct);
router.put("/:id", protect, admin, updateProduct);
router.delete("/:id", protect, admin, deleteProduct);

module.exports = router;
