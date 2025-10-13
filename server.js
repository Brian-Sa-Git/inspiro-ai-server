/* === 💎 Inspiro AI · GPT Ultra (完整版) === */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* === ⚙️ 建立伺服器 === */
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

/* === 🧠 Session 記憶（6 小時）=== */
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

/* === 🔑 環境變數 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // 必填
const HF_TOKEN = process.env.HF_TOKEN; // 必填 (圖片)
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || ""; // 選填 (Web 檢索)

/* === 🧾 系統提示：精品 AI 風格 === */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅且具創意的精品級智能助理。
請遵守：
1️⃣ 回覆簡潔、溫潤、有美感。
2️⃣ 若需產生圖片，請生成精準英文提示詞。
3️⃣ 禁止提及「Google」、「Gemini」、「API」等技術字。
4️⃣ 風格應帶有靈感與品味氣息。
`;

/* === 🧰 工具函式 === */
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
};

const saveImage = (buf, req) => {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
};

/* === 🎨 Hugging Face 圖像生成 === */
async function drawWithHF(prompt, options = {}) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  const model = "stabilityai/stable-diffusion-xl-base-1.0";
  const body = {
    inputs: prompt,
    parameters: {
      negative_prompt: options.negative_prompt || "",
      num_inference_steps: options.num_inference_steps || 30,
      guidance_scale: options.guidance_scale || 7.5,
      ...(options.seed ? { seed: options.seed } : {}),
    },
  };

  const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) throw new Error(`Hugging Face API 錯誤：${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/* === 🌐 Web 檢索 (Tavily) === */
async function webSearch(q) {
  if (!TAVILY_API_KEY) return "";
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query: q, max_results: 5 }),
    });
    const d = await r.json();
    if (!d.results?.length) return "";
    const bullets = d.results.map((x) => `- ${x.title}: ${x.url}`).join("\n");
    return `以下是相關的最新網頁：\n${bullets}`;
  } catch {
    return "";
  }
}

/* === 📁 靜態圖片資料夾 === */
app.use(
  "/generated",
  express.static("generated", {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  })
);

/* === 🌍 狀態測試 === */
app.get("/", (_req, res) => {
  res.send(`✅ Inspiro AI · GPT Ultra 正常運行（模型：${MODEL}）`);
});

/* === 🤖 主核心 API：自動判斷與生成 === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message, imageOptions } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ reply: "⚠️ 請輸入內容。" });

    if (!req.session.history) req.session.history = [];
    const history = req.session.history.slice(-6).map((x) => `${x.role}: ${x.text}`).join("\n");

    /* === 判斷使用者意圖 === */
    const isImage = /(畫|生成|圖片|插畫|海報|design|illustration|image)/i.test(message);
    const isTranslate = /(翻譯|translate|成英文|to english)/i.test(message);
    const isSummary = /(摘要|總結|summary)/i.test(message);
    const isSearch = /(查詢|新聞|最近|最新|who|what|when|搜尋)/i.test(message);

    /* === 圖像生成流程 === */
    if (isImage) {
      const promptBuilder = `
${SYS_PROMPT}
請將以下描述轉為簡潔、具體的英文繪圖提示詞（prompt）：
使用者輸入：${message}
`;

      const genPrompt = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: promptBuilder }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 200 },
          }),
        }
      );

      const promptData = await genPrompt.json();
      const englishPrompt =
        promptData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || message;
      const finalPrompt = `${englishPrompt}, luxury black-gold aesthetic, ultra-detailed, 4K render`;

      const buffer = await drawWithHF(finalPrompt, imageOptions);
      const url = saveImage(buffer, req);

      req.session.history.push({ role: "user", text: message });
      req.session.history.push({ role: "ai", text: "[image]" });

      return res.json({
        mode: "image",
        usedPrompt: finalPrompt,
        imageUrl: url,
        imageBase64: `data:image/png;base64,${buffer.toString("base64")}`,
      });
    }

    /* === 若需要搜尋 === */
    const webNotes = isSearch ? await webSearch(message) : "";

    /* === 一般文字生成 === */
    const context = `
${SYS_PROMPT}

最近對話節錄：
${history || "(無記錄)"}

使用者：${message}
${isTranslate ? "請翻譯成英文。" : ""}
${isSummary ? "請摘要重點，條列呈現。" : ""}
${webNotes ? `\n${webNotes}` : ""}
`;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: context }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 1000 },
        }),
      }
    );

    const d = await r.json();
    const reply =
      d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n").trim() ||
      "🤖 Inspiro AI 暫時沒有回覆內容。";

    req.session.history.push({ role: "user", text: message });
    req.session.history.push({ role: "ai", text: reply });

    res.json({ mode: "text", reply, source: isSearch ? "web+ai" : "chat" });
  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({
      mode: "error",
      reply: "⚠️ Inspiro AI 暫時無法回覆，請稍後再試。",
      error: String(err.message || err),
    });
  }
});

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI · GPT Ultra 正在執行於 port ${PORT}`);
});
