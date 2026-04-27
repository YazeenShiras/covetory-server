const mongoose = require("mongoose");

// Atomic counter for sequential invoice numbers.
// One document per "scope" (e.g. invoice-FY25-26).
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String }, // scope key
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

counterSchema.statics.next = async function (scope) {
  const doc = await this.findOneAndUpdate(
    { _id: scope },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model("Counter", counterSchema);
