import { createClient } from "@supabase/supabase-js";

// Public endpoint — a trade submits their bid using only the token they got
// in their invite email. No login. The token is the gate, mirroring the
// change-order approval flow.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    token,
    contractor_name,
    total_price,
    line_items,
    inclusions,
    exclusions,
    notes,
    attachment_urls,
  } = req.body || {};

  if (!token) return res.status(400).json({ error: "Missing token" });
  if (total_price == null || isNaN(Number(total_price)) || Number(total_price) <= 0) {
    return res.status(400).json({ error: "Total price is required" });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL env var");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Look up the invitation. user_id and project_id are stamped onto the bid
  // so RLS works for the GC's normal authenticated reads.
  const { data: inv, error: fetchErr } = await supabase
    .from("bid_invitations")
    .select("id, user_id, project_id, trade_name, status, expires_at")
    .eq("token", token)
    .single();

  if (fetchErr || !inv) {
    return res.status(404).json({ error: "Invitation not found" });
  }
  if (inv.status === "submitted") {
    return res.status(409).json({ error: "Bid already submitted for this invitation" });
  }
  if (inv.status === "declined" || inv.status === "expired") {
    return res.status(409).json({ error: "This invitation is closed" });
  }
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    await supabase.from("bid_invitations").update({ status: "expired" }).eq("id", inv.id);
    return res.status(410).json({ error: "Invitation expired" });
  }

  // Insert the bid
  const { data: bid, error: insertErr } = await supabase
    .from("trade_bids")
    .insert({
      invitation_id: inv.id,
      user_id: inv.user_id,
      project_id: inv.project_id,
      trade_name: inv.trade_name,
      contractor_name: contractor_name || null,
      total_price: Number(total_price),
      line_items: Array.isArray(line_items) ? line_items : [],
      inclusions: inclusions || null,
      exclusions: exclusions || null,
      notes: notes || null,
      attachment_urls: Array.isArray(attachment_urls) ? attachment_urls : [],
    })
    .select()
    .single();

  if (insertErr) {
    console.error("Bid insert error:", insertErr);
    return res.status(500).json({ error: insertErr.message });
  }

  // Mark invitation as submitted
  const { error: updateErr } = await supabase
    .from("bid_invitations")
    .update({ status: "submitted" })
    .eq("id", inv.id);
  if (updateErr) console.warn("Invitation status update warning:", updateErr.message);

  return res.status(200).json({ success: true, bid_id: bid.id });
}
