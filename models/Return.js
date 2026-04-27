const mongoose = require("mongoose");

const RETURN_TYPES = ["return", "exchange"];

const RETURN_STATUSES = [
  "requested", // customer submitted
  "approved", // admin approved — waiting for customer to ship back
  "rejected", // admin rejected (reason required)
  "received", // item came back to warehouse
  "refunded", // money returned (terminal for type='return')
  "replacement_shipped", // replacement on its way (terminal for type='exchange')
  "cancelled", // customer cancelled before resolution
];

const REASONS = [
  "wrong_size",
  "defective",
  "not_as_described",
  "didnt_fit",
  "changed_mind",
  "arrived_late",
  "damaged_in_transit",
  "other",
];

const returnItemSchema = new mongoose.Schema(
  {
    // References the order item (we copy a snapshot too in case the order is amended)
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    name: String,
    image: String,
    color: String,
    size: String,
    qty: { type: Number, required: true, min: 1 },
    pricePaid: Number, // unit price paid for refund math
  },
  { _id: false }
);

const returnSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    guestEmail: { type: String, lowercase: true, trim: true, index: true },

    type: {
      type: String,
      enum: RETURN_TYPES,
      default: "return",
      required: true,
    },
    status: {
      type: String,
      enum: RETURN_STATUSES,
      default: "requested",
      index: true,
    },

    items: {
      type: [returnItemSchema],
      required: true,
      validate: (v) => v.length > 0,
    },

    reason: { type: String, enum: REASONS, required: true },
    notes: { type: String, trim: true, maxlength: 1000 },

    // For exchanges only — what they want instead. Free-text, no enforced format.
    replacementRequest: { type: String, trim: true, maxlength: 500 },

    // Lifecycle metadata
    statusHistory: [
      {
        status: { type: String, enum: RETURN_STATUSES },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who actioned (admin or customer)
        note: String, // admin reason if rejected, etc.
      },
    ],

    // Refund details (filled when status hits 'refunded')
    refundAmount: Number,
    refundReference: String, // bank txn ID / Razorpay refund ID
    refundedAt: Date,

    // Replacement order ref (filled when status hits 'replacement_shipped')
    replacementOrder: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },

    // Tracking for customer's return shipment back to us
    returnTrackingNumber: String,
    returnCourier: String,
  },
  { timestamps: true }
);

// Ensure status history is appended on creation
returnSchema.pre("save", function (next) {
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [
      { status: this.status || "requested", at: new Date() },
    ];
  }
  next();
});

returnSchema.statics.STATUSES = RETURN_STATUSES;
returnSchema.statics.TYPES = RETURN_TYPES;
returnSchema.statics.REASONS = REASONS;

// Reason → human label (used in admin UI + emails)
returnSchema.statics.reasonLabel = function (r) {
  return (
    {
      wrong_size: "Wrong size sent",
      defective: "Item is defective",
      not_as_described: "Not as described",
      didnt_fit: "Didn't fit",
      changed_mind: "Changed mind",
      arrived_late: "Arrived too late",
      damaged_in_transit: "Damaged in transit",
      other: "Other",
    }[r] || r
  );
};

module.exports = mongoose.model("Return", returnSchema);
