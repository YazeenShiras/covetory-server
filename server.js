require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/db");

const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const userRoutes = require("./routes/users");
const uploadRoutes = require("./routes/upload");
const paymentRoutes = require("./routes/payment");
const couponRoutes = require("./routes/coupons");
const cartRoutes = require("./routes/cart");
const sharedWishlistRoutes = require("./routes/wishlist");
const analyticsRoutes = require("./routes/analytics");
const returnRoutes = require("./routes/returns");
const { router: reviewRoutes, productReviews } = require("./routes/reviews");

const app = express();

// DB
connectDB();

// Middleware
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:3000"],
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// Routes
app.get("/", (_req, res) => res.json({ ok: true, service: "covetory-api" }));
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", sharedWishlistRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api", analyticsRoutes); // exposes /api/events + /api/analytics/*
app.use("/api/reviews", reviewRoutes);
app.use("/api/products/:id/reviews", productReviews);

// 404
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Honour res.status() set by the controller — common pattern with express-async-handler.
  // Fall back to err.status (some libs set this), then 500.
  let status = err.status;
  if (!status && res.statusCode && res.statusCode >= 400)
    status = res.statusCode;
  if (!status) status = 500;

  // Don't log expected client errors as scary stack traces
  if (status >= 500) console.error("[error]", err);
  else console.warn("[client error]", status, err.message);

  res.status(status).json({
    message: err.message || "Server error",
    ...(process.env.NODE_ENV !== "production" &&
      status >= 500 && { stack: err.stack }),
  });
});

// ===== Cart recovery worker =====
const { processAbandonedCarts } = require("./utils/cartRecovery");
const { protect, admin } = require("./middleware/auth");

// HTTP trigger — for external schedulers (cron-job.org, EasyCron) or admin "run now"
// Auth: header `x-recovery-token` matching CART_RECOVERY_TOKEN env var, OR admin user.
app.post("/api/admin/cart-recovery/run", async (req, res, next) => {
  try {
    const token = req.headers["x-recovery-token"];
    const sharedToken = process.env.CART_RECOVERY_TOKEN;
    const tokenOk = sharedToken && token === sharedToken;
    if (!tokenOk) {
      return protect(req, res, () =>
        admin(req, res, async () => {
          const result = await processAbandonedCarts();
          res.json(result);
        })
      );
    }
    const result = await processAbandonedCarts();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// In-process scheduler — runs every hour. Skip if disabled via env.
const RECOVERY_INTERVAL_MS =
  Number(process.env.CART_RECOVERY_INTERVAL_MIN || 60) * 60 * 1000;
const RECOVERY_DISABLED = process.env.CART_RECOVERY_DISABLED === "true";
if (!RECOVERY_DISABLED && RECOVERY_INTERVAL_MS > 0) {
  setInterval(async () => {
    try {
      const result = await processAbandonedCarts();
      if (result.scanned > 0) {
        console.log("[cart-recovery]", result);
      }
    } catch (err) {
      console.error("[cart-recovery] tick failed:", err?.message);
    }
  }, RECOVERY_INTERVAL_MS);
  console.log(
    `[cart-recovery] scheduled every ${RECOVERY_INTERVAL_MS / 60000} minutes`
  );
}

// ===== Inventory alerts =====
const {
  processInventoryAlerts,
  ENABLED: INVENTORY_ENABLED,
} = require("./utils/inventoryAlert");

// HTTP trigger — supports shared token OR admin auth
app.post("/api/admin/inventory-alerts/run", async (req, res, next) => {
  try {
    const token = req.headers["x-inventory-token"];
    const sharedToken = process.env.INVENTORY_ALERT_TOKEN;
    const tokenOk = sharedToken && token === sharedToken;
    const force = req.query.force === "true";
    if (!tokenOk) {
      return protect(req, res, () =>
        admin(req, res, async () => {
          const result = await processInventoryAlerts({ force });
          res.json(result);
        })
      );
    }
    const result = await processInventoryAlerts({ force });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Daily scheduler — checks once per hour whether the configured run-time has
// passed today. INVENTORY_ALERT_HOUR is the UTC hour to send (default 02 = 7:30 IST).
if (INVENTORY_ENABLED) {
  const SEND_HOUR_UTC = Number(process.env.INVENTORY_ALERT_HOUR ?? 2);
  let lastRunDay = null; // date string we last sent on
  setInterval(async () => {
    try {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (now.getUTCHours() === SEND_HOUR_UTC && lastRunDay !== today) {
        lastRunDay = today;
        const result = await processInventoryAlerts();
        console.log("[inventory]", result);
      }
    } catch (err) {
      console.error("[inventory] tick failed:", err?.message);
    }
  }, 60 * 60 * 1000); // check every hour
  console.log(
    `[inventory] daily digest scheduled at ${String(SEND_HOUR_UTC).padStart(
      2,
      "0"
    )}:00 UTC`
  );
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
