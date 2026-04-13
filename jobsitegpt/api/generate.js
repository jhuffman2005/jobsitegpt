export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("REQUEST BODY:", JSON.stringify(req.body).substring(0, 300));
console.log("MAX TOKENS REQUESTED:", req.body.max_tokens);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    const rawText = data.content?.find(b => b.type === "text")?.text || "";
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    console.log("RAW LENGTH:", rawText.length);
    console.log("FIRST BRACE:", firstBrace);
    console.log("LAST BRACE:", lastBrace);
    console.log("FIRST 200 CHARS:", rawText.substring(0, 200));
    console.log("STOP REASON:", data.stop_reason);

    return res.status(200).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: { message: "Internal server error" } });
  }
}