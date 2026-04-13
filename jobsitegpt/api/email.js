export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
  
    const { to, subject, html, from_name } = req.body;
  
    if (!to || !subject || !html) {
      return res.status(400).json({ error: "Missing required fields: to, subject, html" });
    }
  
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${from_name || "JobSiteGPT"} <onboarding@resend.dev>`,
          to: [to],
          subject,
          html,
        }),
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        console.error("Resend error:", JSON.stringify(data));
        return res.status(response.status).json({ error: data.message || "Email failed" });
      }
  
      return res.status(200).json({ success: true, id: data.id });
    } catch (err) {
      console.error("Email proxy error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }