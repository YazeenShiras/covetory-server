const Cart = require("../models/Cart");
const User = require("../models/User");
const Order = require("../models/Order");
const { sendEmail } = require("../config/email");
const templates = require("./emailTemplates");

// Tunable thresholds
const ABANDON_AFTER_HOURS = Number(process.env.CART_ABANDON_HOURS || 24);
const COOLDOWN_HOURS = Number(process.env.CART_RECOVERY_COOLDOWN_HOURS || 168); // 7 days

/**
 * Process abandoned carts — call this from a scheduler or HTTP trigger.
 * Returns { scanned, emailed, skipped } for logging/observability.
 *
 *  Logic:
 *  1. Find carts last touched > ABANDON_AFTER_HOURS ago, with at least one item.
 *  2. Skip carts where the user has placed an order since the cart was updated.
 *  3. Skip carts already emailed within the cooldown window.
 *  4. Skip users who have opted out of marketing emails.
 *  5. Send the recovery email and stamp recoveryEmailSentAt.
 */
async function processAbandonedCarts({ logger = console } = {}) {
  const now = Date.now();
  const cutoff = new Date(now - ABANDON_AFTER_HOURS * 3600 * 1000);
  const cooldownCutoff = new Date(now - COOLDOWN_HOURS * 3600 * 1000);

  // Find candidates: carts with items, not touched recently, either never emailed
  // or last email outside the cooldown window.
  const candidates = await Cart.find({
    "items.0": { $exists: true },
    updatedAt: { $lte: cutoff },
    $or: [
      { recoveryEmailSentAt: { $exists: false } },
      { recoveryEmailSentAt: null },
      { recoveryEmailSentAt: { $lte: cooldownCutoff } },
    ],
  });

  let emailed = 0;
  let skipped = 0;

  for (const cart of candidates) {
    try {
      // Skip if user opted out or doesn't exist
      const user = await User.findById(cart.user);
      if (!user || user.marketingEmails === false) {
        skipped++;
        continue;
      }

      // Skip if user has placed an order since the cart was last updated
      const recentOrder = await Order.findOne({
        user: cart.user,
        createdAt: { $gte: cart.updatedAt },
      }).select("_id");
      if (recentOrder) {
        skipped++;
        continue;
      }

      // Send email
      const result = await sendEmail({
        to: user.email,
        ...templates.cartRecovery({ name: user.name, cart, user }),
      });

      if (result?.ok) {
        cart.abandonedAt = cart.abandonedAt || cart.updatedAt;
        cart.recoveryEmailSentAt = new Date();
        await cart.save();
        emailed++;
      } else {
        skipped++;
      }
    } catch (err) {
      logger.warn?.("[cart-recovery] failed for cart", cart._id, err?.message);
      skipped++;
    }
  }

  return { scanned: candidates.length, emailed, skipped };
}

module.exports = { processAbandonedCarts };
