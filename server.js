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
app.use("/api/returns", returnRoutes);
app.use("/api", analyticsRoutes); // exposes /api/events + /api/analytics/*
app.use("/api/reviews", reviewRoutes);
app.use("/api/products/:id/reviews", productReviews);

// 404
app.use((req, res) => res.status(404).json({ message: "Not found" }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  console.error("[error]", err);
  res.status(status).json({
    message: err.message || "Server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on :${PORT}`));
