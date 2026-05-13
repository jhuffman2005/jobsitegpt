// Company logo upload / fetch helpers.
//
// Logos used to be stored as base64 data: URLs inside Supabase auth
// user_metadata. That metadata is baked into every JWT, so any non-trivial
// image bloated the Authorization header beyond the Supabase gateway's nginx
// header limit and broke unrelated requests (e.g. file uploads) with a
// generic HTML 400. We now upload the image file to the public
// "company-logos" bucket and persist only its URL in user_metadata.
//
// loadLogoAttachment() still accepts a legacy data: URL so existing users
// keep working until they next visit Settings and re-save.

import { supabase } from "./supabaseClient";

const BUCKET = "company-logos";

export async function uploadCompanyLogo(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${user.id}/logo.${ext || "png"}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so a freshly-replaced logo isn't masked by a CDN cache hit.
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function deleteCompanyLogo() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  // Extension may have changed across uploads, so list and remove everything
  // under the user's prefix rather than guessing the filename.
  const { data: list } = await supabase.storage.from(BUCKET).list(user.id);
  if (list && list.length) {
    await supabase.storage
      .from(BUCKET)
      .remove(list.map(o => `${user.id}/${o.name}`));
  }
}

// Returns { mime, base64, filename } for use as an inline email attachment,
// or null if the source is empty / unreachable. Accepts both a public storage
// URL and a legacy data: URL (so users who haven't re-saved still work).
export async function loadLogoAttachment(logoSource) {
  if (!logoSource || typeof logoSource !== "string") return null;

  if (logoSource.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(logoSource);
    if (!m) return null;
    const mime = m[1];
    const ext = (mime.split("/")[1] || "png").split("+")[0];
    return { mime, base64: m[2], filename: `logo.${ext}` };
  }

  try {
    const res = await fetch(logoSource);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/png";
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    const ext = (mime.split("/")[1] || "png").split("+")[0];
    return { mime, base64, filename: `logo.${ext}` };
  } catch {
    return null;
  }
}
