export async function callClaude(messages, system, maxTokens = 3000) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const e = await res.json();
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