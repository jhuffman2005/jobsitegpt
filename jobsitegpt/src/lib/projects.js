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
    const { data, error } = await supabase
      .from("user_cost_codes")
      .select("codes")
      .single();
    if (error) return []; // no row yet = empty
    return data?.codes || [];
  } catch {
    return [];
  }
}

export async function saveUserCostCodes(codes) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("user_cost_codes")
    .upsert(
      { user_id: user.id, codes, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  if (error) throw error;
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