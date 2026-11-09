// Tram AI cho app Talk Club, chay tren Vercel (may chu o My, Google cho phep).
// Ma Gemini nam trong bien moi truong GEMINI_KEY cua Vercel, khong nam trong ma nguon.
const ALLOWED = ["https://vuongkhangbio-art.github.io", "http://localhost:8765"];
const MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest"]; // ban "latest" tu cap nhat theo Google
const LIMIT_PER_HOUR = 80;
const hits = new Map();

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  res.setHeader("Access-Control-Allow-Origin", ALLOWED.includes(origin) ? origin : ALLOWED[0]);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" || !ALLOWED.includes(origin)) return res.status(403).json({ error: "forbidden" });
  if (!process.env.GEMINI_KEY) return res.status(500).json({ error: "missing_key" });

  const ip = String(req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 3600000);
  if (recent.length >= LIMIT_PER_HOUR) return res.status(429).json({ error: "rate_limited" });
  recent.push(now); hits.set(ip, recent);

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== "object") return res.status(400).json({ error: "bad_json" });
  if (JSON.stringify(body).length > 40000) return res.status(413).json({ error: "too_large" });

  const payload = {
    systemInstruction: { parts: [{ text: String(body.system || "").slice(0, 12000) }] },
    contents: Array.isArray(body.contents) ? body.contents.slice(-20) : [],
    generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
  };
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_KEY },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000)
      });
      if ([404, 429, 500, 503].includes(r.status)) continue;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Model", model);
      return res.status(r.status).send(await r.text());
    } catch (e) { /* qua thoi gian cho thi thu model sau */ }
  }
  return res.status(429).json({ error: "busy" });
}
