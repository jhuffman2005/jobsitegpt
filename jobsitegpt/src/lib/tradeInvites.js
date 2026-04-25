// Shared helpers for sending a scope to a trade for bidding. Used by ScopeGPT
// (right after generation) and BidMatch (the primary bidding hub).

import { createBidInvitation, getUserSettings } from "./projects";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function parseLogoDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const ext = (mime.split("/")[1] || "png").split("+")[0];
  return { mime, base64: m[2], filename: `logo.${ext}` };
}

// Fetches company branding (name + logo) and shapes it for both the email
// HTML and the Resend attachments array. Safe to call repeatedly; cheap.
export async function resolveBranding() {
  let companyName = "";
  let logoDataUrl = "";
  try {
    const settings = await getUserSettings();
    companyName = settings?.company_name || "";
    logoDataUrl = settings?.company_logo || "";
  } catch {}
  const attachments = [];
  let hasLogo = false;
  const logoCid = "company-logo";
  const parsed = parseLogoDataUrl(logoDataUrl);
  if (parsed) {
    attachments.push({
      filename: parsed.filename,
      content: parsed.base64,
      content_id: logoCid,
      content_type: parsed.mime,
      disposition: "inline",
    });
    hasLogo = true;
  }
  return { companyName, hasLogo, logoCid, attachments };
}

// A trade's slice of a scope: same shape as the full scope object so the
// public bid page can render it identically, but trades[] holds only one row.
export function buildTradeSnapshot(scope, trade) {
  return {
    projectName: scope.projectName,
    projectType: scope.projectType,
    projectAddress: scope.projectAddress || null,
    overview: scope.overview,
    generalConditions: scope.generalConditions || [],
    exclusions: scope.exclusions || [],
    clarifications: scope.clarifications || [],
    estimatedDuration: scope.estimatedDuration,
    trades: [trade],
  };
}

export function buildTradeEmailHtml({ scope, trade, contactName, branding, token }) {
  const { hasLogo, logoCid, companyName } = branding || {};
  const link = `${window.location.origin}/bid/${token}`;
  const lineItems = trade.lineItems?.length
    ? `<ul style="margin:8px 0 0;padding-left:18px;color:#1a1f2e;">${trade.lineItems.map((li) => `<li style="font-size:13px;line-height:1.6;margin-bottom:3px;">${esc(li.description)}${li.note ? ` <span style="color:#909ab0;font-style:italic;">— ${esc(li.note)}</span>` : ""}</li>`).join("")}</ul>`
    : "";

  const brandingHeader = (hasLogo || companyName)
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:18px;"><tr>
         ${hasLogo ? `<td style="padding:0 14px 18px 0;border-bottom:1px solid #f0f2f5;vertical-align:middle;width:1%;white-space:nowrap;"><img src="cid:${logoCid}" alt="${esc(companyName || "Company")}" style="display:block;max-height:60px;max-width:180px;object-fit:contain;border:0;outline:none;" /></td>` : ""}
         ${companyName ? `<td style="padding:0 0 18px;border-bottom:1px solid #f0f2f5;vertical-align:middle;font-weight:700;font-size:15px;letter-spacing:0.04em;color:#1a1f2e;">${esc(companyName)}</td>` : ""}
       </tr></table>`
    : "";

  const sender = companyName || "JobSiteGPT";
  const greeting = contactName ? `Hi ${esc(contactName)},` : "Hello,";

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#1a1f2e;">
    <div style="max-width:680px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e0e4ef;border-top:3px solid #f0a500;border-radius:8px;padding:28px 30px;">
        ${brandingHeader}
        <div style="font-size:11px;letter-spacing:0.12em;color:#909ab0;text-transform:uppercase;margin-bottom:8px;">Bid Request · ${esc(trade.tradeName)}</div>
        <h1 style="font-size:24px;margin:0 0 6px;color:#1a1f2e;letter-spacing:0.02em;">${esc(scope.projectName)}</h1>
        <div style="font-size:12px;color:#909ab0;">${esc(scope.projectType)}${scope.projectAddress ? ` · ${esc(scope.projectAddress)}` : ""}</div>
        <p style="font-size:14px;color:#1a1f2e;margin:22px 0 0;">${greeting}</p>
        <p style="font-size:14px;color:#1a1f2e;line-height:1.6;margin:8px 0 0;">${esc(sender)} is requesting a bid for the <strong>${esc(trade.tradeName)}</strong> scope on the project above. Please review the scope and submit your pricing through the link below — no account needed.</p>

        <div style="margin:24px 0 22px;padding:16px 18px;background:#f8f9fc;border:1px solid #e0e4ef;border-radius:8px;">
          <div style="font-weight:700;font-size:15px;color:#1a1f2e;margin-bottom:8px;">${esc(trade.tradeName)} — Scope</div>
          <div style="font-size:13px;line-height:1.6;color:#1a1f2e;">${esc(trade.scopeText)}</div>
          ${lineItems}
        </div>

        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${link}" style="background:#f0a500;color:#000;padding:14px 32px;text-decoration:none;font-weight:bold;font-size:15px;border-radius:6px;display:inline-block;">→ Review Scope &amp; Submit Bid</a>
        </div>
        <div style="text-align:center;font-size:11px;color:#909ab0;margin-top:8px;">Or paste this link into your browser: <span style="color:#606880;">${link}</span></div>

        <div style="margin-top:28px;padding-top:16px;border-top:1px solid #f0f2f5;font-size:11px;color:#909ab0;">Sent by ${esc(sender)} via JobSiteGPT</div>
      </div>
    </div>
  </body></html>`;
}

// Creates the invitation row, sends the email, returns the invitation.
// Throws on either step failing so the caller can surface per-row errors.
export async function sendTradeInvitation({ scope, trade, contactName, email, branding, projectId, generationId }) {
  const inv = await createBidInvitation({
    projectId: projectId || null,
    generationId: generationId || null,
    tradeName: trade.tradeName,
    tradeContactName: contactName || null,
    tradeEmail: email,
    scopeSnapshot: buildTradeSnapshot(scope, trade),
  });

  const html = buildTradeEmailHtml({ scope, trade, contactName, branding, token: inv.token });
  const fromName = branding?.companyName || "JobSiteGPT";
  const res = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: email,
      subject: `Bid Request — ${scope.projectName} · ${trade.tradeName}`,
      html,
      from_name: fromName,
      attachments: branding?.attachments || [],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Email failed");
  return inv;
}
