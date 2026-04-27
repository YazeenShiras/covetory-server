const Razorpay = require("razorpay");

let instance = null;
let configured = false;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  configured = true;
} else {
  console.warn(
    "[razorpay] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing — payment endpoints will return 503."
  );
}

module.exports = { razorpay: instance, isConfigured: () => configured };
