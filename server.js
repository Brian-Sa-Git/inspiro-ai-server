/* === 🧩 模組匯入 === */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* === 🧱 建立伺服器 === */
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));

/* === 🔐 安全標頭設定 === */
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

/* === 🧠 Session 設定（MemoryStore）=== */
const MemoryStore = memorystore(session);
app.use(
  session({
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
    store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
    secret: process.env.SESSION_SECRET || "inspiro-secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

/* === 🧩 Gemini 設定 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const HF_TOKEN = process.env.HF_TOKEN;

const INSPRIRO_SYSTEM_PROMPT = `
你是 Inspiro AI，一個高級靈感創作助理。
請注意：
1️⃣ 你只能以「Inspiro AI」自稱。
2️⃣ 不可以提及「Google」、「Gemini」、「API」等技術詞。
3️⃣ 回覆風格應優雅、有創意，像精品品牌一樣。
`;

/* === 🌐 根路徑測試 === */
app.get("/", (_req, res) => {
  res.send(`✅ Inspiro AI Server 已啟動（模型：${MODEL}）`);
});

/* === 🧠 工具函式 === */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
}
function saveImageReturnUrl(buffer, req) {
  const folderPath = path.join(process.cwd(), "generated");
  ensureDir(folderPath);
  const fileName = `inspiro-${Date.now()}.png`;
  const filePath = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, buffer);
  const base = `${req.protocol}://${req.get("host")}`;
  return { downloadUrl: `${base}/generated/${fileName}` };
}

/* === 🤖 文字生成 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!GEMINI_API_KEY)
      return res.status(500).json({ reply: "⚠️ Inspiro AI 金鑰未設定。" });
    if (!message?.trim())
      return res.status(400).json({ reply: "⚠️ 請輸入對話內容。" });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${INSPRIRO_SYSTEM_PROMPT}\n\n使用者訊息：${message}` }],
        },
      ],
      generationConfig: { temperature: 0.8, maxOutputTokens: 800 },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "🤖 Inspiro AI 暫時沒有回覆內容。";
    res.json({ reply });
  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ reply: "⚠️ Inspiro AI 發生暫時錯誤。" });
  }
});

/* === 🧠 智慧語意分析 === */
app.post("/api/analyze", async (req, res) => {
  const { message } = req.body || {};
  try {
    const prompt = `
你是一個「意圖分類助手」，請分析使用者是否要「生成圖片」或「一般對話」。
- 若包含「畫、生成、圖片、設計、風景、人像、AI圖、photo、illustration」→ type 為 "image"
- 否則 type 為 "text"

輸出 JSON：
{ "type": "image" } 或 { "type": "text" }

使用者輸入：${message}
`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const type = text.toLowerCase().includes("image") ? "image" : "text";

    console.log(`🧩 分析結果：「${message}」→ ${type}`);
    res.json({ type });
  } catch (err) {
    console.error("❌ /api/analyze 錯誤：", err);
    res.status(500).json({ type: "text" });
  }
});

/* === 🎨 Hugging Face 圖像生成 === */
async function generateWithHF(prompt, options = {}) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定。");
  const model = "stabilityai/stable-diffusion-xl-base-1.0";

  const body = {
    inputs: prompt,
    parameters: {
      num_inference_steps: options.num_inference_steps || 30,
      guidance_scale: options.guidance_scale || 7.5,
    },
  };

  const resp = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`HF API Error: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

/* === 🎨 智慧圖片生成 API === */
app.post("/api/image-smart", async (req, res) => {
  const { message } = req.body || {};
  try {
    console.log("🎨 使用者請求圖片：", message);
    const analysis = await fetch(`${req.protocol}://${req.get("host")}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }).then((r) => r.json());

    if (analysis.type !== "image")
      return res.status(400).json({ error: "不是圖片請求" });

    const prompt = `
${message}, luxury black-gold aesthetic, glowing light,
3D glossy texture, cinematic lighting, ultra-realistic, 4K render
`;

    const buffer = await generateWithHF(prompt);
    const { downloadUrl } = saveImageReturnUrl(buffer, req);
    res.json({
      ok: true,
      usedPrompt: prompt,
      imageBase64: `data:image/png;base64,${buffer.toString("base64")}`,
      imageUrl: downloadUrl,
    });
  } catch (err) {
    console.error("💥 /api/image-smart 錯誤：", err);
    res.status(500).json({ error: "⚠️ Inspiro AI 無法生成圖片。" });
  }
});

/* === 📁 靜態檔案（強化版）=== */
app.use(
  "/generated",
  express.static("generated", {
    setHeaders: (res, filePath) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
      res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (filePath.endsWith(".png")) res.setHeader("Content-Type", "image/png");
      if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg"))
        res.setHeader("Content-Type", "image/jpeg");
    },
  })
);
app.options("/generated/*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Range");
  res.sendStatus(204);
});

/* === 🧹 自動清理舊圖片（每3小時）=== */
setInterval(() => {
  const folder = path.join(process.cwd(), "generated");
  if (!fs.existsSync(folder)) return;
  const now = Date.now();
  const limit = 3 * 60 * 60 * 1000;
  fs.readdirSync(folder).forEach((file) => {
    const filePath = path.join(folder, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > limit) {
      fs.unlinkSync(filePath);
      console.log(`🧹 已刪除舊檔案：${file}`);
    }
  });
}, 3 * 60 * 60 * 1000);

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI Server 正在執行於 port ${PORT}`);
  console.log("🌍 模型：", MODEL);
});

/* === 💤 防止 Railway 自動休眠 === */
setInterval(async () => {
  try {
    await fetch("https://inspiro-ai-server-production.up.railway.app/");
    console.log("💤 Inspiro AI still alive", new Date().toLocaleTimeString());
  } catch {
    console.warn("⚠️ Railway ping 失敗");
  }
}, 60 * 1000);
