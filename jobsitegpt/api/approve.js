import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, status } = req.body;

  if (!token || !["approved", "declined"].includes(status)) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // Use service role key to bypass RLS — this endpoint is intentionally public
  // (any request with a valid token can update, matching the approval flow intent)
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL env var");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Verify the record exists and is still pending
  const { data: existing, error: fetchErr } = await supabase
    .from("change_order_approvals")
    .select("id, status, contractor_email, co_data")
    .eq("token", token)
    .single();

  if (fetchErr || !existing) {
    return res.status(404).json({ error: "Approval not found" });
  }

  if (existing.status !== "pending") {
    return res.status(409).json({ error: "Already actioned", status: existing.status });
  }

  const { error: updateErr } = await supabase
    .from("change_order_approvals")
    .update({ status, approved_at: new Date().toISOString() })
    .eq("token", token);

  if (updateErr) {
    console.error("Approve update error:", updateErr);
    return res.status(500).json({ error: updateErr.message });
  }

  return res.status(200).json({
    success: true,
    contractor_email: existing.contractor_email,
    co_data: existing.co_data,
  });
}
