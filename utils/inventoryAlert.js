const Product = require("../models/Product");
const User = require("../models/User");
const { sendEmail } = require("../config/email");
const { analyseStock } = require("./inventory");
const templates = require("./emailTemplates");

const ENABLED = process.env.INVENTORY_ALERT_DISABLED !== "true";

/**
 * Scan every product, compute inventory status, send a digest email to all
 * admins listing low and out-of-stock items. Returns a summary for logging.
 *
 * Skips sending if there's nothing to report (no spam on healthy days).
 */
async function processInventoryAlerts({
  logger = console,
  force = false,
} = {}) {
  const products = await Product.find({}).select(
    "name images colors variantStock stock lowStockThreshold price"
  );

  const lowItems = [];
  const outItems = [];

  for (const p of products) {
    const a = analyseStock(p);
    const primaryImage = p.colors?.[0]?.images?.[0]?.url || p.images?.[0]?.url;
    const summary = {
      _id: p._id,
      name: p.name,
      image: primaryImage,
      price: p.price,
      threshold: a.threshold,
      totalStock: a.totalStock,
      lowVariants: a.lowVariants,
      outVariants: a.outVariants,
    };
    if (a.status === "out") outItems.push(summary);
    else if (a.status === "low") lowItems.push(summary);
  }

  if (lowItems.length === 0 && outItems.length === 0 && !force) {
    return {
      scanned: products.length,
      low: 0,
      out: 0,
      emailed: 0,
      skipped: "nothing-to-report",
    };
  }

  // Find admin recipients
  const admins = await User.find({ isAdmin: true }).select("name email");
  if (admins.length === 0) {
    logger.warn?.("[inventory] no admin users found — nothing to email");
    return {
      scanned: products.length,
      low: lowItems.length,
      out: outItems.length,
      emailed: 0,
      skipped: "no-admins",
    };
  }

  let emailed = 0;
  for (const admin of admins) {
    try {
      const result = await sendEmail({
        to: admin.email,
        ...templates.inventoryDigest({
          name: admin.name,
          lowItems,
          outItems,
        }),
      });
      if (result?.ok) emailed++;
    } catch (err) {
      logger.warn?.("[inventory] failed to email", admin.email, err?.message);
    }
  }

  return {
    scanned: products.length,
    low: lowItems.length,
    out: outItems.length,
    emailed,
  };
}

module.exports = { processInventoryAlerts, ENABLED };
