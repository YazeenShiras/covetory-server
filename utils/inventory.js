// Inventory analysis — shared between the products list response, the email job,
// and any other place that needs to know "what's running low?".

const DEFAULT_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 5);

/**
 * Resolve the threshold for a single product. Per-product setting wins;
 * otherwise fall back to the global default.
 */
function thresholdFor(product) {
  if (
    typeof product.lowStockThreshold === "number" &&
    product.lowStockThreshold >= 0
  ) {
    return product.lowStockThreshold;
  }
  return DEFAULT_THRESHOLD;
}

/**
 * Analyse a single product's stock state. Returns:
 *   { status: 'healthy' | 'low' | 'out', totalStock, lowVariants, outVariants, threshold }
 *
 *  - "out": every variant is 0 (or for products without variants, total stock is 0)
 *  - "low": at least one variant is 0 < qty <= threshold (or total stock is)
 *  - "healthy": neither
 */
function analyseStock(product) {
  const threshold = thresholdFor(product);
  const variantStock = product.variantStock || {};
  const variantKeys = Object.keys(variantStock);

  // Variant-based product
  if (variantKeys.length > 0) {
    const variants = variantKeys.map((key) => {
      const [color, size] = key.split("__");
      return {
        color: color || "",
        size: size || "",
        qty: Number(variantStock[key]) || 0,
      };
    });
    const totalStock = variants.reduce((s, v) => s + v.qty, 0);
    const outVariants = variants.filter((v) => v.qty === 0);
    const lowVariants = variants.filter((v) => v.qty > 0 && v.qty <= threshold);
    let status = "healthy";
    if (variants.length > 0 && outVariants.length === variants.length)
      status = "out";
    else if (lowVariants.length > 0 || outVariants.length > 0) status = "low";
    return { status, totalStock, lowVariants, outVariants, threshold };
  }

  // Simple product (no variants)
  const totalStock = Number(product.stock) || 0;
  let status = "healthy";
  if (totalStock === 0) status = "out";
  else if (totalStock <= threshold) status = "low";
  return { status, totalStock, lowVariants: [], outVariants: [], threshold };
}

/**
 * Project a Product document into a lightweight inventory summary.
 * Used in product list responses so the admin UI can render badges
 * without recomputing.
 */
function inventorySummary(product) {
  const a = analyseStock(product);
  return {
    status: a.status,
    totalStock: a.totalStock,
    threshold: a.threshold,
    lowCount: a.lowVariants.length,
    outCount: a.outVariants.length,
  };
}

module.exports = {
  DEFAULT_THRESHOLD,
  thresholdFor,
  analyseStock,
  inventorySummary,
};
