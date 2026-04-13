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