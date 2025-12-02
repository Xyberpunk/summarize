// api/summarize.js
import dotenv from "dotenv";

// Load .env locally; Vercel will inject env vars in production
dotenv.config();

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || process.env.VITE_API_KEY; // fallback for your current .env
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const APP_URL = process.env.APP_URL || "http://localhost:5500";
const APP_TITLE = process.env.APP_TITLE || "Meeting Summarizer";

export default async function handler(req, res) {
  if (!OPENROUTER_API_KEY) {
    console.error("Missing OPENROUTER_API_KEY (or VITE_API_KEY) in env");
    return res.status(500).json({ error: "Server is not configured." });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { transcript } = req.body || {};

    if (
      !transcript ||
      typeof transcript !== "string" ||
      transcript.trim().length < 20
    ) {
      return res
        .status(400)
        .json({ error: "Transcript is required (min ~20 chars)." });
    }

    const prompt = `
You are an expert meeting assistant.
Summarize the following meeting transcript into concise bullet points.

Rules:
- Each bullet should be a single actionable point, decision, or key insight.
- Group bullets under short headers if there are multiple topics.
- If action items exist, end with a section "Action Items" listing owner + task.
- Do not invent facts.

Transcript:
"""${transcript}"""
    `.trim();

    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": APP_URL,
        "X-Title": APP_TITLE,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: "You summarize meeting transcripts." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!orRes.ok) {
      const text = await orRes.text();
      console.error("OpenRouter error:", text);
      return res.status(orRes.status).json({ error: text });
    }

    const data = await orRes.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      return res.status(500).json({ error: "No summary returned from model." });
    }

    return res.json({
      summary,
      model: data.model,
      usage: data.usage,
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Server error." });
  }
}
