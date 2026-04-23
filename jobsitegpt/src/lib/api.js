// Max combined raw file size (bytes) before the JSON body + base64 encoding
// will likely exceed Vercel's ~4.5 MB request limit. Base64 inflates by ~33%
// and JSON wrapping adds a bit more; staying under ~3.2 MB raw is safe.
export const MAX_UPLOAD_BYTES = 3_300_000;

// Pre-flight size check: returns an error message if the combined uploads
// would exceed the serverless request limit, or null if it's safe to send.
export function checkPayloadSize({ files = [], projectFiles = [] } = {}) {
  const totalBytes = [
    ...projectFiles.map((pf) => Number(pf.file_size) || 0),
    ...files.map((f) => Number(f.size) || 0),
  ].reduce((a, b) => a + b, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    const mb = (totalBytes / 1024 / 1024).toFixed(1);
    const limitMb = (MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(1);
    return `Your attached files total ${mb} MB, but the combined upload limit is ${limitMb} MB. Remove or compress a file (or split into separate runs) and try again.`;
  }
  return null;
}

export async function callClaude(messages, system, maxTokens = 16000) {
  let res;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: maxTokens,
        system,
        messages,
      }),
    });
  } catch (err) {
    // fetch() itself rejected — browser never got a response. In Safari this
    // shows up as "Load failed"; in Chrome/Firefox as "Failed to fetch" or
    // "NetworkError". Most common causes here: uploaded files pushed the body
    // past Vercel's 4.5 MB limit, connection dropped, or the tab was
    // backgrounded on mobile long enough to be killed.
    throw new Error(
      "Connection dropped before the server responded. This usually means your uploaded files are too large (combined over ~4.5 MB) or your network cut out. Try removing large PDFs or switching to a stable Wi-Fi connection."
    );
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("Your uploaded files are too large for the server to accept. Keep the combined upload under 3 MB.");
    }
    let e = {};
    try { e = await res.json(); } catch {}
    throw new Error(e.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.content?.find((b) => b.type === "text")?.text || "";

  // Extract JSON by finding outermost braces — ignores fences, preamble, anything else
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("AI response was not valid JSON. Try again.");
  }

  const clean = raw.slice(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("AI response was not valid JSON. Try again.");
  }
}

export function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("File read failed"));
    r.readAsDataURL(file);
  });
}

export function downloadTxt(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadJson(filename, obj) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })
  );
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Save HTML content as a .doc file. Word opens HTML natively when the file has
// a .doc extension and the application/msword MIME type — no library needed.
export function downloadDoc(filename, bodyHtml, title = "Document") {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]--><style>@page{size:8.5in 11in;margin:1in}body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1a1f2e;line-height:1.5}</style></head><body>${bodyHtml}</body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff", html], { type: "application/msword" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}