const { Resend } = require("resend");

let resend = null;
let enabled = false;

if (process.env.RESEND_API_KEY) {
  try {
    resend = new Resend(process.env.RESEND_API_KEY);
    enabled = true;
  } catch (err) {
    console.warn("[email] failed to init Resend:", err.message);
  }
} else {
  console.warn(
    "[email] RESEND_API_KEY missing — emails will be logged to console instead of sent."
  );
}

const FROM = process.env.EMAIL_FROM || "Covetory <onboarding@resend.dev>";

/**
 * sendEmail({ to, subject, html, text, attachments })
 * Never throws — email is best-effort. Logs success/failure.
 *
 * attachments: [{ filename: "invoice.pdf", content: Buffer }]
 *   (pass-through to Resend — works the same for other providers via standard fields.)
 */
async function sendEmail({ to, subject, html, text, attachments }) {
  if (!enabled) {
    console.log("[email:dry-run]", {
      to,
      subject,
      attachments: (attachments || []).map((a) => a.filename),
    });
    console.log(text || (html || "").replace(/<[^>]+>/g, ""));
    return { ok: true, dryRun: true };
  }
  try {
    const payload = { from: FROM, to, subject, html, text };
    if (attachments && attachments.length) payload.attachments = attachments;
    const result = await resend.emails.send(payload);
    console.log("[email:sent]", to, subject, result?.data?.id || "");
    return { ok: true, id: result?.data?.id };
  } catch (err) {
    console.error("[email:failed]", to, subject, err?.message);
    return { ok: false, error: err?.message };
  }
}

module.exports = { sendEmail, isEmailEnabled: () => enabled };
