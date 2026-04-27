const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String,
  },
  { _id: false }
);

const colorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Ecru", "Navy"
    hex: { type: String, trim: true }, // e.g. "#F4F1EC"
    images: [imageSchema], // this color's own photos
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, sparse: true, lowercase: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 }, // optional "was" price
    category: { type: String, required: true, trim: true },

    // Fallback image set used when a product has no colors (single-variant item).
    // If `colors` has entries, the storefront prefers color.images.
    images: [imageSchema],

    // Variants
    colors: [colorSchema], // [{ name, hex, images:[...] }]
    sizes: [{ type: String, trim: true }], // ["XS", "S", "M", "L"]

    // Optional per-variant stock, keyed by `${color}__${size}`.
    // If a key is missing, fall back to the top-level `stock`.
    // Example: { "Ecru__M": 4, "Ecru__L": 2, "Navy__M": 6 }
    variantStock: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },

    stock: { type: Number, required: true, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
    hsn: { type: String, default: "6109", trim: true }, // default: HSN 6109 — knit/crocheted apparel
  },
  { timestamps: true }
);

productSchema.pre("save", function (next) {
  if (this.isModified("name") && !this.slug) {
    this.slug =
      this.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") +
      "-" +
      Math.random().toString(36).slice(2, 6);
  }
  next();
});

// Full-text search — name weighted highest, then category, then description
productSchema.index(
  { name: "text", category: "text", description: "text" },
  {
    weights: { name: 10, category: 5, description: 1 },
    name: "product_text_idx",
  }
);

// Helper: how much of a given variant is available?
productSchema.methods.stockFor = function (color, size) {
  if (this.variantStock && (color || size)) {
    const key = `${color || ""}__${size || ""}`;
    const v = this.variantStock[key];
    if (typeof v === "number") return v;
  }
  return this.stock;
};

module.exports = mongoose.model("Product", productSchema);
