const PDFDocument = require("pdfkit");
const {
  formatInvoiceNumber,
  splitTax,
  rupeesInWords,
  formatINR,
} = require("./invoiceHelpers");

// Note on the rupee symbol: pdfkit's default (PDF core) fonts don't include
// the ₹ glyph. We use "Rs." in the PDF to keep it portable without bundling
// a TTF. If you'd like a ₹ glyph, drop a Unicode TTF (e.g. NotoSans) into
// /backend/fonts and register it with `doc.font(pathToTtf)` before drawing.
const RUPEE = "Rs. ";
const fmt = (n) =>
  RUPEE +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const COLORS = {
  ink: "#1A1A1A",
  muted: "#6E6962",
  line: "#D8D3CA",
  accent: "#A67B5B",
  subtleBg: "#F7F3EC",
};

const MARGIN = 40;
const COL_GAP = 16;

/**
 * Renders the invoice PDF into the given writable stream.
 * The order must already have `invoiceNumber` and `taxBreakdown` set.
 *
 *   renderInvoice(order, stream, options?) -> Promise<void>
 */
function renderInvoice(order, stream, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      info: {
        Title: `Invoice ${order.invoiceNumber}`,
        Author: process.env.SELLER_NAME || "Covetory",
        Subject: `Tax invoice for order ${order._id}`,
      },
    });

    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    try {
      drawInvoice(doc, order, options);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawInvoice(doc, order, _options) {
  const sellerName = process.env.SELLER_NAME || "Covetory";
  const sellerAddr = [
    process.env.SELLER_ADDRESS_LINE1,
    process.env.SELLER_ADDRESS_LINE2,
    [
      process.env.SELLER_CITY,
      process.env.SELLER_STATE,
      process.env.SELLER_POSTAL_CODE,
    ]
      .filter(Boolean)
      .join(", "),
    process.env.SELLER_COUNTRY,
  ].filter(Boolean);
  const sellerGstin = process.env.SELLER_GSTIN || "";

  const buyer = order.shippingAddress || {};
  const buyerName =
    order.user?.name || order.guestName || buyer.name || "Customer";
  const buyerEmail = order.user?.email || order.guestEmail || "";

  const pageWidth = doc.page.width - MARGIN * 2;
  const startY = MARGIN;

  // ---------------- Header ----------------
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(24)
    .text(sellerName, MARGIN, startY);

  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  let y = doc.y + 2;
  for (const line of sellerAddr) {
    doc.text(line, MARGIN, y, { width: pageWidth / 2 });
    y = doc.y;
  }
  if (sellerGstin) {
    doc.fillColor(COLORS.ink).text(`GSTIN  ${sellerGstin}`, MARGIN, y + 2);
  }

  // Top-right — "TAX INVOICE" label + meta
  doc
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("TAX INVOICE", MARGIN, startY, {
      width: pageWidth,
      align: "right",
    });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text("ORIGINAL FOR RECIPIENT", MARGIN, doc.y + 2, {
      width: pageWidth,
      align: "right",
    });

  // Meta block
  const metaY = doc.y + 14;
  const metaRightX = MARGIN + pageWidth * 0.55;
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  const metaRows = [
    ["Invoice No.", order.invoiceNumber],
    ["Invoice Date", fmtDate(order.invoiceDate || order.createdAt)],
    ["Order No.", `#${String(order._id).slice(-8).toUpperCase()}`],
    ["Order Date", fmtDate(order.createdAt)],
    ["Payment", paymentLabel(order)],
  ];
  let metaRowY = metaY;
  for (const [k, v] of metaRows) {
    doc
      .fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(8)
      .text(k, metaRightX, metaRowY, { width: 100 });
    doc
      .fillColor(COLORS.ink)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(v, metaRightX + 110, metaRowY, {
        width: pageWidth - (metaRightX - MARGIN) - 110,
        align: "right",
      });
    metaRowY += 13;
  }

  doc
    .moveTo(MARGIN, metaRowY + 6)
    .lineTo(MARGIN + pageWidth, metaRowY + 6)
    .strokeColor(COLORS.line)
    .lineWidth(0.75)
    .stroke();

  // ---------------- Bill-to / Ship-to ----------------
  const partiesY = metaRowY + 18;
  const partyColW = (pageWidth - COL_GAP) / 2;

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("BILL TO", MARGIN, partiesY);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(buyerName, MARGIN, doc.y + 2, { width: partyColW });
  let billY = doc.y + 1;
  const buyerLines = [
    buyer.line1,
    buyer.line2,
    [buyer.city, buyer.state, buyer.postalCode].filter(Boolean).join(", "),
    buyer.country,
    buyer.phone,
    buyerEmail,
  ].filter(Boolean);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink);
  for (const l of buyerLines) {
    doc.text(l, MARGIN, billY, { width: partyColW });
    billY = doc.y;
  }
  if (order.buyerGstin) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`GSTIN  ${order.buyerGstin}`, MARGIN, billY + 2, {
        width: partyColW,
      });
  }

  // Ship To
  const shipX = MARGIN + partyColW + COL_GAP;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("SHIP TO", shipX, partiesY);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(buyer.name || buyerName, shipX, partiesY + 10, { width: partyColW });
  let shipY = doc.y + 1;
  const shipLines = [
    buyer.line1,
    buyer.line2,
    [buyer.city, buyer.state, buyer.postalCode].filter(Boolean).join(", "),
    buyer.country,
  ].filter(Boolean);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink);
  for (const l of shipLines) {
    doc.text(l, shipX, shipY, { width: partyColW });
    shipY = doc.y;
  }

  // Place of supply — useful for auditors
  const placeY = Math.max(billY, shipY) + 14;
  const placeOfSupply = buyer.state || "—";
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(`Place of supply:  `, MARGIN, placeY, { continued: true })
    .fillColor(COLORS.ink)
    .font("Helvetica-Bold")
    .text(placeOfSupply);

  // ---------------- Items table ----------------
  const tableY = placeY + 22;
  const COLS = computeItemColumns(pageWidth);

  drawItemsHeader(doc, COLS, tableY);
  let rowY = tableY + 20;

  const items = order.items || [];
  for (let i = 0; i < items.length; i++) {
    rowY = drawItemRow(doc, items[i], i + 1, COLS, rowY);
  }

  // Row separator
  doc
    .moveTo(MARGIN, rowY + 2)
    .lineTo(MARGIN + pageWidth, rowY + 2)
    .strokeColor(COLORS.line)
    .lineWidth(0.75)
    .stroke();

  // ---------------- Totals ----------------
  const totalsY = rowY + 14;
  const breakdown =
    order.taxBreakdown ||
    splitTax({
      taxAmount: order.taxPrice,
      sellerStateCode: process.env.SELLER_STATE_CODE,
      sellerStateName: process.env.SELLER_STATE,
      buyerGstin: order.buyerGstin,
      buyerState: buyer.state,
    });

  const rows = [["Subtotal (taxable value)", order.itemsPrice]];
  if (order.discountPrice > 0) {
    rows.push([
      `Discount${order.couponCode ? ` (${order.couponCode})` : ""}`,
      -order.discountPrice,
    ]);
  }
  if (breakdown.type === "cgst_sgst") {
    rows.push([`CGST @ ${breakdown.rate / 2}%`, breakdown.cgst]);
    rows.push([`SGST @ ${breakdown.rate / 2}%`, breakdown.sgst]);
  } else {
    rows.push([`IGST @ ${breakdown.rate}%`, breakdown.igst]);
  }
  rows.push([
    order.shippingPrice === 0 ? "Shipping" : "Shipping",
    order.shippingPrice,
  ]);

  const labelX = MARGIN + pageWidth * 0.55;
  const labelW = pageWidth * 0.25;
  const amountX = MARGIN + pageWidth * 0.8;
  const amountW = pageWidth * 0.2;

  let tY = totalsY;
  doc.font("Helvetica").fontSize(9);
  for (const [label, amt] of rows) {
    doc.fillColor(COLORS.muted).text(label, labelX, tY, { width: labelW });
    doc
      .fillColor(COLORS.ink)
      .text((amt < 0 ? "- " : "") + fmt(Math.abs(amt)), amountX, tY, {
        width: amountW,
        align: "right",
      });
    tY += 14;
  }

  // Total row — emphasized
  tY += 2;
  doc
    .moveTo(labelX, tY)
    .lineTo(MARGIN + pageWidth, tY)
    .strokeColor(COLORS.ink)
    .lineWidth(0.75)
    .stroke();
  tY += 6;
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.ink);
  doc.text("Total", labelX, tY, { width: labelW });
  doc.text(fmt(order.totalPrice), amountX, tY, {
    width: amountW,
    align: "right",
  });

  // ---------------- Amount in words ----------------
  const wordsY = tY + 28;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("Amount in words", MARGIN, wordsY);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(rupeesInWords(order.totalPrice), MARGIN, wordsY + 11, {
      width: pageWidth,
    });

  // ---------------- Footer ----------------
  const footerY = doc.page.height - MARGIN - 64;
  doc
    .moveTo(MARGIN, footerY - 6)
    .lineTo(MARGIN + pageWidth, footerY - 6)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();

  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted);
  doc.text("Declaration", MARGIN, footerY);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.ink)
    .text(
      "We certify that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
      MARGIN,
      footerY + 10,
      {
        width: pageWidth * 0.6,
      }
    );

  // Signature block on the right
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(`For ${sellerName}`, MARGIN + pageWidth * 0.65, footerY, {
      width: pageWidth * 0.35,
      align: "right",
    });
  doc
    .moveTo(MARGIN + pageWidth * 0.7, footerY + 34)
    .lineTo(MARGIN + pageWidth, footerY + 34)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text("Authorised Signatory", MARGIN + pageWidth * 0.65, footerY + 36, {
      width: pageWidth * 0.35,
      align: "right",
    });

  // Bottom note
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text(
      "This is a computer-generated invoice and does not require a physical signature.",
      MARGIN,
      doc.page.height - MARGIN - 10,
      { width: pageWidth, align: "center" }
    );
}

// =========================================================
//  Helpers
// =========================================================

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function paymentLabel(order) {
  if (order.paymentMethod === "cod") return "Cash on delivery";
  if (order.paymentMethod === "razorpay")
    return order.isPaid ? "Paid · Razorpay" : "Razorpay (pending)";
  return order.paymentMethod || "Pending";
}

// Column definition for the items table — weighted widths of the content area
function computeItemColumns(pageWidth) {
  // Weights (must sum to 1)
  const weights = {
    sn: 0.05,
    desc: 0.41,
    hsn: 0.1,
    qty: 0.08,
    rate: 0.18,
    total: 0.18,
  };
  let x = MARGIN;
  const cols = {};
  for (const [k, w] of Object.entries(weights)) {
    cols[k] = { x, width: pageWidth * w };
    x += pageWidth * w;
  }
  return cols;
}

function drawItemsHeader(doc, cols, y) {
  doc.rect(MARGIN, y, doc.page.width - MARGIN * 2, 18).fill(COLORS.subtleBg);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(8);
  const ty = y + 6;
  doc.text("#", cols.sn.x + 4, ty, { width: cols.sn.width - 4 });
  doc.text("DESCRIPTION", cols.desc.x + 4, ty, { width: cols.desc.width - 4 });
  doc.text("HSN", cols.hsn.x, ty, { width: cols.hsn.width, align: "center" });
  doc.text("QTY", cols.qty.x, ty, { width: cols.qty.width, align: "center" });
  doc.text("RATE", cols.rate.x, ty, {
    width: cols.rate.width - 4,
    align: "right",
  });
  doc.text("AMOUNT", cols.total.x, ty, {
    width: cols.total.width - 4,
    align: "right",
  });
}

function drawItemRow(doc, item, idx, cols, y) {
  const rowHeightEstimate = 26;
  const line = Number(item.price) * Number(item.qty);

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink);
  doc.text(String(idx), cols.sn.x + 4, y + 3, { width: cols.sn.width - 4 });

  // Description (name + optional variant)
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.ink)
    .text(item.name || "—", cols.desc.x + 4, y + 3, {
      width: cols.desc.width - 4,
    });
  const variantBits = [item.color, item.size].filter(Boolean).join(" · ");
  let descEnd = doc.y;
  if (variantBits) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(variantBits, cols.desc.x + 4, descEnd, {
        width: cols.desc.width - 4,
      });
    descEnd = doc.y;
  }

  doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted);
  doc.text(item.hsn || "6109", cols.hsn.x, y + 3, {
    width: cols.hsn.width,
    align: "center",
  });
  doc.fillColor(COLORS.ink);
  doc.text(String(item.qty), cols.qty.x, y + 3, {
    width: cols.qty.width,
    align: "center",
  });
  doc.text(fmt(item.price), cols.rate.x, y + 3, {
    width: cols.rate.width - 4,
    align: "right",
  });
  doc.font("Helvetica-Bold").text(fmt(line), cols.total.x, y + 3, {
    width: cols.total.width - 4,
    align: "right",
  });

  // Row divider
  const endY = Math.max(descEnd + 4, y + rowHeightEstimate);
  doc
    .moveTo(MARGIN, endY)
    .lineTo(MARGIN + (doc.page.width - MARGIN * 2), endY)
    .strokeColor(COLORS.line)
    .lineWidth(0.25)
    .stroke();

  return endY;
}

module.exports = { renderInvoice };
