/* === 🧩 模組匯入 === */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* === 🧱 建立伺服器 === */
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

/* === 🧠 Session 記憶（6小時）=== */
const MemoryStore = memorystore(session);
app.use(
  session({
    cookie: { maxAge: 6 * 60 * 60 * 1000 },
    store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
    secret: process.env.SESSION_SECRET || "inspiro-secret",
    resave: false,
    saveUninitialized: true,
  })
);

/* === 🔑 金鑰與模型 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;                // 必填
const HF_TOKEN = process.env.HF_TOKEN;                            // 必填（圖片）
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";          // 選填：Web 查詢

/* === 🧾 系統提示（精品風） === */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅且具創意的精品級智能助理。
準則：
- 回覆簡潔、溫潤、有美感；必要時條列。
- 若使用者要圖片，產出清晰的英文提示詞；用詞準確、可重現。
- 禁止提及 Google/Gemini/API 等技術字。
`;

/* === 🧰 工具 === */
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); };
const saveImage = (buf, req) => {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
};

/* 圖片：Hugging Face（可調參） */
async function drawWithHF(prompt, {
  negative_prompt = "",
  num_inference_steps = 30,
  guidance_scale = 7.5,
  seed
} = {}) {
  if (!HF_TOKEN) throw new Error("缺少 HF_TOKEN");
  const model = "stabilityai/stable-diffusion-xl-base-1.0";
  const body = {
    inputs: prompt,
    parameters: {
      negative_prompt,
      num_inference_steps,
      guidance_scale,
      ...(seed ? { seed } : {})
    }
  };
  const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`HF ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* Web 查詢（Tavily；沒有金鑰就跳過） */
async function webSearch(q) {
  if (!TAVILY_API_KEY) return null;
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TAVILY_API_KEY}` },
    body: JSON.stringify({ query: q, max_results: 5 })
  });
  if (!r.ok) return null;
  const data = await r.json();
  const bullets = (data.results || []).map(x => `- ${x.title}: ${x.url}`).join("\n");
  return `Web findings:\n${bullets || "(no strong results)"}`;
}

/* === 根路徑 === */
app.get("/", (_req, res) => {
  res.send(`✅ Inspiro AI · GPT Ultra 正常運行（模型：${MODEL}）`);
});

/* === 靜態圖片 === */
app.use(
  "/generated",
  express.static("generated", {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  })
);

/* === Ultra：單一路由，自動工具選擇 === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message, imageOptions } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ mode: "error", reply: "⚠️ 請輸入內容。" });

    // 建立/維持記憶
    if (!req.session.history) req.session.history = [];
    const shortHistory = req.session.history.slice(-6).map(x => `${x.role}: ${x.text}`).join("\n");

    // 1) 輕量意圖判斷（可依需求再加字典）
    const lower = message.toLowerCase();
    const isImage = /(畫|生成|圖片|海報|插畫|illustration|image|poster|design)/i.test(message);
    const wantsTranslate = /(翻譯|translate\s|to english|成英文)/i.test(message);
    const wantsSummary  = /(總結|摘要|summary)/i.test(message);
    const wantsSearch   = /(最新|新聞|查一下|找一下|who is|what is|when is)/i.test(message);

    /* 2) 繪圖工具 */
    if (isImage) {
      // 先用 Gemini 生成「英文提示詞」（讓畫風更準）
      const promptBuilder = `${SYS_PROMPT}
你是一名資深提示詞工程師。把使用者的中文或混合描述，轉為精簡但完整的英文畫面提示詞。
包含：主題、構圖、鏡頭、光線、材質、細節，避免抽象詞。每段以逗號分隔。
使用者：${message}`;
      const r1 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: promptBuilder }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 300 } })
      });
      const d1 = await r1.json();
      const englishPrompt = d1?.candidates?.[0]?.content?.parts?.map(p=>p.text).join(" ").trim() || message;

      const finalPrompt =
        `${englishPrompt}, luxury black-gold aesthetic, cinematic soft glow, ultra-detailed, 4K render`;

      const buf = await drawWithHF(finalPrompt, imageOptions || { num_inference_steps: 30, guidance_scale: 7.5 });
      const url = saveImage(buf, req);
      req.session.history.push({ role: "user", text: message });
      req.session.history.push({ role: "ai", text: "[image]" });
      return res.json({
        mode: "image",
        toolUsed: "huggingface",
        usedPrompt: finalPrompt,
        imageUrl: url,
        imageBase64: `data:image/png;base64,${buf.toString("base64")}`
      });
    }

    /* 3) 需要搜尋？（可關閉） */
    let webNotes = "";
    if (wantsSearch) {
      const out = await webSearch(message);
      if (out) webNotes = `\n\n${out}`;
    }

    /* 4) 一般對話 / 翻譯 / 摘要由同一路徑處理 */
    const taskHint = wantsTranslate ? "（請翻譯成英文並保留專有名詞）"
                   : wantsSummary  ? "（請做要點式摘要）"
                   : "";

    const fullPrompt = `${SYS_PROMPT}

最近對話（節選）：
${shortHistory || "(none)"}

使用者：${message} ${taskHint}
${webNotes ? `\n來自網路檢索的線索（僅供參考，必要時整合）：\n${webNotes}` : ""}

回覆要求：
- 用清晰段落或條列，避免冗長。
- 如果你不確定，說「可能」並提供多種解釋。
`;

    const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: { temperature: 0.75, maxOutputTokens: 1000 }
      })
    });

    const d2 = await r2.json();
    const reply =
      d2?.candidates?.[0]?.content?.parts?.map(p=>p.text).join("\n").trim()
      || "🤖 Inspiro AI 暫時沒有回覆內容。";

    req.session.history.push({ role: "user", text: message });
    req.session.history.push({ role: "ai", text: reply });

    res.json({ mode: "text", toolUsed: webNotes ? "web+chat" : "chat", reply });
  } catch (err) {
    console.error("💥 /api/generate", err);
    res.status(500).json({ mode: "error", reply: "⚠️ Inspiro AI 無法回覆，請稍後再試。", error: String(err.message||err) });
  }
});

/* === 啟動 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI · GPT Ultra running on ${PORT}`);
});
