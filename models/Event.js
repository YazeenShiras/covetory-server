const mongoose = require("mongoose");

const EVENT_TYPES = ["view", "add_to_cart", "checkout_started"];

const eventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true, index: true },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      index: true,
    },
    sessionId: { type: String, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    ts: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// TTL — drop docs older than 90 days. Mongo runs the cleaner roughly once/min.
eventSchema.index({ ts: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

eventSchema.statics.TYPES = EVENT_TYPES;

module.exports = mongoose.model("Event", eventSchema);
