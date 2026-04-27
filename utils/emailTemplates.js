// Minimal, client-safe email templates.
// Keep things inline — Gmail strips <style> tags, Outlook is its own planet.

const colors = {
  ink: "#1A1A1A",
  bg: "#F4F1EC",
  muted: "#8A8278",
  line: "#E5E0D8",
  accent: "#A67B5B",
};

const BRAND = "Covetory";
const SITE = process.env.FRONTEND_URL || "http://localhost:3000";

const wrap = (inner) => `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${
    colors.bg
  };font-family:Georgia,'Times New Roman',serif;color:${colors.ink};">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:40px 16px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;max-width:560px;background:#FFFDF9;border:1px solid ${
            colors.line
          };">
            <tr>
              <td style="padding:32px 32px 16px;border-bottom:1px solid ${
                colors.line
              };">
                <div style="font-size:28px;letter-spacing:-0.02em;">${BRAND}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:${
                colors.ink
              };">
                ${inner}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid ${
                colors.line
              };font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${
  colors.muted
};text-align:center;">
                © ${new Date().getFullYear()} ${BRAND}. Quiet luxury, considered things.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const btn = (href, label) => `
<a href="${href}" style="display:inline-block;background:${colors.ink};color:${colors.bg};padding:14px 28px;text-decoration:none;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;">
  ${label}
</a>`;

const formatINR = (n) =>
  `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: n % 1 ? 2 : 0,
  })}`;

// ---------- Templates ----------

function passwordReset({ name, resetUrl }) {
  const html = wrap(`
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 16px;">Reset your password</h1>
    <p>Hi ${name || "there"},</p>
    <p>We received a request to reset the password on your ${BRAND} account. Click the button below to set a new one. The link expires in one hour.</p>
    <p style="margin:32px 0;">${btn(resetUrl, "Reset password")}</p>
    <p style="color:${colors.muted};font-size:12px;">
      If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
    <p style="color:${colors.muted};font-size:12px;word-break:break-all;">
      Or paste this link into your browser:<br/>${resetUrl}
    </p>`);
  const text = `Hi ${
    name || "there"
  },\n\nReset your ${BRAND} password here (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`;
  return { subject: `Reset your ${BRAND} password`, html, text };
}

function orderConfirmation({ name, order }) {
  const rows = (order.items || [])
    .map(
      (it) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid ${colors.line};">
        <div>${it.name}</div>
        ${
          it.color || it.size
            ? `<div style="color:${
                colors.muted
              };font-size:12px;margin-top:2px;">${[it.color, it.size]
                .filter(Boolean)
                .join(" · ")}</div>`
            : ""
        }
      </td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid ${
        colors.line
      };">× ${it.qty}</td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid ${
        colors.line
      };">${formatINR(it.price * it.qty)}</td>
    </tr>`
    )
    .join("");

  const addr = order.shippingAddress || {};
  const addrLines = [
    addr.name,
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postalCode].filter(Boolean).join(", "),
    addr.country,
  ]
    .filter(Boolean)
    .map((l) => `<div>${l}</div>`)
    .join("");

  const orderUrl = `${SITE}/account?tab=orders&order=${order._id}`;

  const html = wrap(`
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 8px;">Thank you, ${
      name?.split(" ")[0] || "friend"
    }.</h1>
    <p style="color:${colors.muted};margin-top:0;">Order #${String(
    order._id
  ).slice(-8)} — ${new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}</p>
    <p>We've received your order and will be in touch when it ships.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;font-size:14px;">${rows}</table>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${
      colors.muted
    };">
      <tr><td>Subtotal</td><td align="right" style="color:${
        colors.ink
      };">${formatINR(order.itemsPrice)}</td></tr>
      <tr><td>Shipping</td><td align="right" style="color:${colors.ink};">${
    order.shippingPrice === 0 ? "Free" : formatINR(order.shippingPrice)
  }</td></tr>
      <tr><td>GST</td><td align="right" style="color:${
        colors.ink
      };">${formatINR(order.taxPrice)}</td></tr>
      ${
        order.discountPrice > 0
          ? `<tr><td>Promo ${
              order.couponCode ? `(${order.couponCode})` : ""
            }</td><td align="right" style="color:${
              colors.accent
            };">- ${formatINR(order.discountPrice)}</td></tr>`
          : ""
      }
      <tr><td style="padding-top:12px;border-top:1px solid ${
        colors.line
      };color:${colors.ink};font-weight:600;">Total</td>
          <td align="right" style="padding-top:12px;border-top:1px solid ${
            colors.line
          };color:${colors.ink};font-weight:600;">${formatINR(
    order.totalPrice
  )}</td></tr>
    </table>
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid ${
      colors.line
    };">
      <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${
        colors.muted
      };margin:0 0 8px;">Shipping to</p>
      <div style="font-size:13px;line-height:1.8;">${addrLines}</div>
    </div>
    ${
      order.invoiceNumber
        ? `
    <div style="margin-top:20px;padding:14px 16px;border:1px solid ${colors.line};background:${colors.bg};font-size:12px;color:${colors.muted};">
      Your tax invoice <b style="color:${colors.ink};font-family:monospace;">${order.invoiceNumber}</b> is attached as a PDF.
    </div>`
        : ""
    }
    <p style="margin-top:32px;">${btn(orderUrl, "View order")}</p>`);

  const text = `Thanks for your order #${String(order._id).slice(
    -8
  )} at ${BRAND}. Total: ${formatINR(
    order.totalPrice
  )}. Track it at ${orderUrl}`;
  return {
    subject: `Order confirmed · #${String(order._id).slice(-8)}`,
    html,
    text,
  };
}

function orderStatusUpdate({
  name,
  order,
  newStatus,
  trackingNumber,
  trackingUrl,
}) {
  const friendly = {
    processing: "Your order is being prepared",
    shipped: "Your order is on the way",
    delivered: "Your order has been delivered",
    cancelled: "Your order was cancelled",
  };
  const heading = friendly[newStatus] || `Order updated`;
  const orderUrl = `${SITE}/account?tab=orders&order=${order._id}`;

  const trackBlock =
    newStatus === "shipped" && (trackingNumber || trackingUrl)
      ? `
    <div style="margin:24px 0;padding:16px;border:1px solid ${
      colors.line
    };background:${colors.bg};">
      <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${
        colors.muted
      };margin:0 0 6px;">Tracking</p>
      ${
        trackingNumber
          ? `<div style="font-family:monospace;margin-bottom:6px;">${trackingNumber}</div>`
          : ""
      }
      ${
        trackingUrl
          ? `<a href="${trackingUrl}" style="color:${colors.accent};font-size:13px;">Track on courier site →</a>`
          : ""
      }
    </div>`
      : "";

  const html = wrap(`
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 8px;">${heading}</h1>
    <p style="color:${colors.muted};margin-top:0;">Order #${String(
    order._id
  ).slice(-8)}</p>
    <p>Hi ${
      name?.split(" ")[0] || "there"
    }, your order status is now <b>${newStatus}</b>.</p>
    ${trackBlock}
    <p style="margin-top:24px;">${btn(orderUrl, "View order")}</p>`);

  const text = `${heading}. Order #${String(order._id).slice(-8)}. ${
    trackingNumber ? `Tracking: ${trackingNumber}.` : ""
  } ${orderUrl}`;
  return { subject: heading, html, text };
}

function welcome({ name }) {
  const html = wrap(`
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:26px;margin:0 0 16px;">Welcome to ${BRAND}, ${
    name?.split(" ")[0] || "friend"
  }.</h1>
    <p>You're in. A considered wardrobe of natural materials and minimal silhouettes, made in small runs by workshops we trust.</p>
    <p>New arrivals land on the first Thursday of each month.</p>
    <p style="margin-top:24px;">${btn(`${SITE}/shop`, "Enter the shop")}</p>`);
  const text = `Welcome to ${BRAND}, ${
    name || "friend"
  }. Explore new arrivals at ${SITE}/shop`;
  return { subject: `Welcome to ${BRAND}`, html, text };
}

module.exports = {
  passwordReset,
  orderConfirmation,
  orderStatusUpdate,
  welcome,
};
