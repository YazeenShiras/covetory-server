// Utilities shared between invoice number allocation and PDF rendering.

// ---------- Financial year ----------
// Indian FY runs April 1 → March 31. Returns "25-26" for FY 2025–26.
function financialYearOf(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed (Jan = 0)
  const start = m >= 3 ? y : y - 1; // April (3) or later → start = this year
  const end = start + 1;
  return `${String(start).slice(-2)}-${String(end).slice(-2)}`;
}

// "25-26" → "covetory-invoice-FY25-26"
function counterScopeForFY(fy) {
  return `covetory-invoice-FY${fy}`;
}

// Pad a number to fixed width. seq=42, width=5 → "00042"
function padSeq(n, width = 5) {
  return String(n).padStart(width, "0");
}

// Human invoice number: "COV/25-26/00042"
function formatInvoiceNumber(fy, seq) {
  return `COV/${fy}/${padSeq(seq)}`;
}

// ---------- Tax split ----------
// Infers whether sale is intra-state (CGST+SGST) or inter-state (IGST)
// by comparing the first two digits of GSTIN-equivalent state codes.
//
// In India, the first two digits of a GSTIN are the state code. We compare
// the seller's state code (from env) to the buyer's state. For the buyer we
// either use their GSTIN prefix (if provided) or match the state name.
function splitTax({
  taxAmount,
  sellerStateCode,
  sellerStateName,
  buyerGstin,
  buyerState,
}) {
  const sc = String(sellerStateCode || "").trim();
  const bc =
    buyerGstin && buyerGstin.length >= 2 ? buyerGstin.slice(0, 2) : null;

  let intraState;
  if (bc) {
    intraState = bc === sc;
  } else if (buyerState && sellerStateName) {
    intraState =
      String(buyerState).trim().toLowerCase() ===
      String(sellerStateName).trim().toLowerCase();
  } else {
    // Default assumption if we can't tell: treat as intra-state
    intraState = true;
  }

  const amt = +(Number(taxAmount) || 0).toFixed(2);
  if (intraState) {
    const half = +(amt / 2).toFixed(2);
    return {
      type: "cgst_sgst",
      cgst: half,
      sgst: +(amt - half).toFixed(2), // account for rounding so CGST+SGST == amt
      igst: 0,
      rate: 18,
    };
  }
  return {
    type: "igst",
    cgst: 0,
    sgst: 0,
    igst: amt,
    rate: 18,
  };
}

// ---------- Number to words (Indian system, rupees) ----------
// Keeps things vendor-neutral (no extra dep).

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function twoDigit(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}

function threeDigit(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h > 0) parts.push(ONES[h] + " Hundred");
  if (rest > 0) parts.push(twoDigit(rest));
  return parts.join(" ");
}

function numberToWordsIndian(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return "Zero";

  const parts = [];
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const rest = num;

  if (crore > 0) parts.push(threeDigit(crore) + " Crore");
  if (lakh > 0) parts.push(twoDigit(lakh) + " Lakh");
  if (thousand > 0) parts.push(twoDigit(thousand) + " Thousand");
  if (rest > 0) parts.push(threeDigit(rest));
  return parts.join(" ").trim();
}

function rupeesInWords(amount) {
  const n = Number(amount) || 0;
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let s = `${numberToWordsIndian(rupees)} Rupees`;
  if (paise > 0) s += ` and ${twoDigit(paise)} Paise`;
  return s + " only";
}

// ---------- Currency formatter ----------
function formatINR(n) {
  const v = Number(n) || 0;
  return (
    "₹" +
    v.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

module.exports = {
  financialYearOf,
  counterScopeForFY,
  padSeq,
  formatInvoiceNumber,
  splitTax,
  rupeesInWords,
  formatINR,
};
