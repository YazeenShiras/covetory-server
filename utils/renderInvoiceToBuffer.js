const { Writable } = require("stream");
const { renderInvoice } = require("./invoicePdf");

/**
 * Renders an invoice into memory and returns a Buffer.
 * Used for attaching to order confirmation emails.
 */
async function renderInvoiceToBuffer(order) {
  const chunks = [];
  const collector = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  await renderInvoice(order, collector);
  return Buffer.concat(chunks);
}

module.exports = { renderInvoiceToBuffer };
