/* === 💎 Inspiro AI · GPT Ultra (整合 Hugging Face Chat + Image) === */
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

/* === 🌍 CORS 設定：只允許你的網站 === */
app.use(cors({
  origin: [
    "https://amphibian-hyperboloid-z7dj.squarespace.com", // 測試網址
    "https://www.inspiroai.com" // 正式網域
  ],
  credentials: true
}));

/* === 📦 Body Parser：限制 10MB，防止惡意請求 === */
app.use(bodyParser.json({ limit: "10mb" }));

/* === 🧠 Session 記憶（6 小時）=== */
const MemoryStore = memorystore(session);
app.use(session({
  cookie: { maxAge: 6 * 60 * 60 * 1000 },
  store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
  secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
  resave: false,
  saveUninitialized: true,
}));

/* === 🔑 環境變數 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_TOKEN = process.env.HF_TOKEN;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

/* === 🧾 系統提示：精品 AI 風格 === */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅且具創意的精品級智能助理。
請遵守：
1️⃣ 回覆簡潔、有靈感且具品味。
2️⃣ 若需生成圖片，請用精確英文提示詞。
3️⃣ 禁止提及 Google、Gemini、API 等技術字。
4️⃣ 所有回覆須自然流暢、有設計感。
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

/* === 💬 Hugging Face Chat 模型（Kimi-K2） === */
async function chatWithHF(prompt) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  const url = "https://router.huggingface.co/v1/chat/completions";

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "moonshotai/Kimi-K2-Instruct-0905",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(`HF Chat 錯誤 (${r.status}): ${JSON.stringify(data)}`);
  return data?.choices?.[0]?.message?.content || "⚠️ 無回覆內容。";
}

/* === 🎨 Hugging Face 圖像生成（FLUX.1-dev / SDXL） === */
async function drawWithHF(prompt, options = {}) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  const model = options.model || "black-forest-labs/FLUX.1-dev"; // 或改 SDXL
  const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Hugging Face 圖像錯誤 (${r.status}): ${errText.slice(0, 200)}`);
  }

  return Buffer.from(await r.arrayBuffer());
}

/* === 🌐 Web 檢索 (Tavily，可選) === */
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
    return d.results.map((x) => `- ${x.title}: ${x.url}`).join("\n");
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
  res.send(`✅ Inspiro AI · GPT Ultra 正常運行（Gemini: ${GEMINI_MODEL}）`);
});

/* === 🤖 主核心 API：智能生成 === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message, mode, imageOptions } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ reply: "⚠️ 請輸入內容。" });

    console.log("🗣️ User message:", message);
    if (!req.session.history) req.session.history = [];

    /* === 🔍 意圖判斷 === */
    const isImage = /(畫|生成|圖片|插畫|海報|illustration|design|image)/i.test(message);
    const isSearch = /(查詢|搜尋|最新|news|who|when|where)/i.test(message);
    const isChat = !isImage && !isSearch;

    /* === 🖼️ 圖像生成 === */
    if (isImage || mode === "image") {
      // 用 Gemini 幫使用者把中文轉為 prompt
      const rPrompt = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${SYS_PROMPT}\n將以下描述轉為具體英文繪圖提示詞：${message}` }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 150 },
          }),
        }
      );
      const dataPrompt = await rPrompt.json().catch(() => ({}));
      const englishPrompt = dataPrompt?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || message;
      const finalPrompt = `${englishPrompt}, luxury black-gold aesthetic, cinematic glow, detailed 4K`;

      let buffer;
      try {
        buffer = await drawWithHF(finalPrompt, imageOptions);
      } catch (err) {
        console.error("🎨 Hugging Face 圖像錯誤：", err.message);
        const fallback = fs.readFileSync(path.join(process.cwd(), "fallback.png"));
        const fallbackUrl = saveImage(fallback, req);
        return res.json({
          ok: false,
          mode: "image",
          reply: "⚠️ Inspiro AI 圖片生成失敗，已顯示預設圖。",
          imageUrl: fallbackUrl,
          imageBase64: `data:image/png;base64,${fallback.toString("base64")}`,
        });
      }

      const url = saveImage(buffer, req);
      return res.json({
        ok: true,
        mode: "image",
        usedPrompt: finalPrompt,
        imageUrl: url,
        imageBase64: `data:image/png;base64,${buffer.toString("base64")}`,
      });
    }

    /* === 🌐 搜尋型 === */
    const searchNotes = isSearch ? await webSearch(message) : "";

    /* === 💬 一般文字對話 === */
    const context = `
${SYS_PROMPT}
使用者輸入：${message}
${searchNotes ? `\n相關資料：\n${searchNotes}` : ""}
`;

    let reply;
    try {
      reply = await chatWithHF(context);
    } catch (err) {
      console.error("💬 Hugging Face Chat 錯誤：", err.message);
      reply = "⚠️ Inspiro AI 無法回應，請稍後再試。";
    }

    req.session.history.push({ role: "user", text: message });
    req.session.history.push({ role: "ai", text: reply });

    res.json({ ok: true, mode: "text", reply });
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
