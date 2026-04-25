import { supabase } from "./supabaseClient";

export async function getProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getProject(id) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createProject(fields) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...fields, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, fields) {
  const { data, error } = await supabase
    .from("projects")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id) {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function getProjectFiles(projectId) {
  const { data, error } = await supabase
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function uploadProjectFile(projectId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  const path = `${user.id}/${projectId}/${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(path, file);
  if (uploadError) throw uploadError;
  const { data, error } = await supabase
    .from("project_files")
    .insert({ user_id: user.id, project_id: projectId, file_name: file.name, file_type: file.type, file_size: file.size, storage_path: path })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getProjectFileUrl(storagePath) {
  const { data } = await supabase.storage
    .from("project-files")
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl;
}

export async function deleteProjectFile(id, storagePath) {
  await supabase.storage.from("project-files").remove([storagePath]);
  const { error } = await supabase.from("project_files").delete().eq("id", id);
  if (error) throw error;
}

export async function getProjectFileAsBase64(storagePath) {
  const { data, error } = await supabase.storage
    .from("project-files")
    .download(storagePath);
  if (error) throw error;
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(data);
  });
}

// ── Generation History ────────────────────────────────────────────────────

export async function saveGeneration(projectId, tool, title, summary, resultData) {
  if (!projectId) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("project_generations")
      .insert({ project_id: projectId, user_id: user.id, tool, title, summary, result_data: resultData })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn("saveGeneration failed:", e.message);
    return null;
  }
}

export async function getGenerations(projectId) {
  try {
    const { data, error } = await supabase
      .from("project_generations")
      .select("id, tool, title, summary, created_at, result_data")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn("getGenerations failed:", e.message);
    return [];
  }
}

// ── Change Order Approvals ────────────────────────────────────────────────

export async function storeApproval(token, projectId, coData, contractorEmail) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("change_order_approvals")
    .insert({
      token,
      user_id: user.id,
      project_id: projectId || null,
      co_data: coData,
      contractor_email: contractorEmail || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getApproval(token) {
  const { data, error } = await supabase
    .from("change_order_approvals")
    .select("*")
    .eq("token", token)
    .single();
  if (error) throw error;
  return data;
}

export async function updateApprovalStatus(token, status) {
  const { error } = await supabase
    .from("change_order_approvals")
    .update({ status, approved_at: new Date().toISOString() })
    .eq("token", token);
  if (error) throw error;
}

// ── User Cost Codes ───────────────────────────────────────────────────────

export async function getUserCostCodes() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    // Scope to the authenticated user and use maybeSingle so a missing row is
    // not treated as an error (first-time users have no row yet).
    const { data, error } = await supabase
      .from("user_cost_codes")
      .select("codes")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.warn("getUserCostCodes failed:", error.message);
      return [];
    }
    return Array.isArray(data?.codes) ? data.codes : [];
  } catch (e) {
    console.warn("getUserCostCodes exception:", e.message);
    return [];
  }
}

export async function saveUserCostCodes(codes) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("user_cost_codes")
    .upsert(
      { user_id: user.id, codes, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw error;
}

export async function updateGeneration(id, fields) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("project_generations")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Single Generation (for "View in tool" click-through) ──────────────────

export async function getGenerationById(id) {
  if (!id) return null;
  try {
    const { data, error } = await supabase
      .from("project_generations")
      .select("id, project_id, tool, title, summary, created_at, result_data")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.warn("getGenerationById failed:", error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn("getGenerationById exception:", e.message);
    return null;
  }
}

// ── Bid Invitations & Trade Bids ──────────────────────────────────────────

function makeToken(prefix = "bid") {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

export async function createBidInvitation({ projectId, generationId, tradeName, tradeContactName, tradeEmail, scopeSnapshot, expiresInDays = 14 }) {
  const { data: { user } } = await supabase.auth.getUser();
  const token = makeToken();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { data, error } = await supabase
    .from("bid_invitations")
    .insert({
      token,
      user_id: user.id,
      project_id: projectId || null,
      generation_id: generationId || null,
      trade_name: tradeName,
      trade_contact_name: tradeContactName || null,
      trade_email: tradeEmail,
      scope_snapshot: scopeSnapshot,
      expires_at: expiresAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getBidInvitation(token) {
  const { data, error } = await supabase
    .from("bid_invitations")
    .select("*")
    .eq("token", token)
    .single();
  if (error) throw error;
  return data;
}

// All invitations a GC has sent for a given project (for the BidMatch dashboard)
export async function getProjectBidInvitations(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from("bid_invitations")
    .select("*")
    .eq("project_id", projectId)
    .order("sent_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// All submitted bids for a project, grouped by invitation
export async function getProjectTradeBids(projectId) {
  if (!projectId) return [];
  const { data, error } = await supabase
    .from("trade_bids")
    .select("*")
    .eq("project_id", projectId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Bid lookup for the trade's own confirmation page (no auth)
export async function getTradeBidByInvitation(invitationId) {
  if (!invitationId) return null;
  const { data, error } = await supabase
    .from("trade_bids")
    .select("*")
    .eq("invitation_id", invitationId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("getTradeBidByInvitation failed:", error.message);
    return null;
  }
  return data;
}

// ── User Settings ─────────────────────────────────────────────────────────

export async function saveUserSettings(settings) {
  const { error } = await supabase.auth.updateUser({ data: settings });
  if (error) throw error;
}

export async function getUserSettings() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata || {};
}