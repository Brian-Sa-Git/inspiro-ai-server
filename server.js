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

/* === ⚙️ 重要環境變數 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_TOKEN = process.env.HF_TOKEN;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/* === 🧠 系統提示詞 === */
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

/* === 🧰 共用工具函式 === */
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

/* === 💬 Gemini 文字生成 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!GEMINI_API_KEY) return res.status(500).json({ reply: "⚠️ Inspiro AI 金鑰未設定。" });
    if (!message?.trim()) return res.status(400).json({ reply: "⚠️ 請輸入對話內容。" });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        { role: "user", parts: [{ text: `${INSPRIRO_SYSTEM_PROMPT}\n\n使用者訊息：${message}` }] },
      ],
      generationConfig: { temperature: 0.8, maxOutputTokens: 800 },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "🤖 Inspiro AI 暫時沒有回覆內容。";
    res.json({ reply });
  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ reply: "⚠️ Inspiro AI 發生暫時錯誤。" });
  }
});

/* === 🧠 智慧語意分析 API === */
app.post("/api/analyze", async (req, res) => {
  const { message } = req.body || {};
  try {
    const prompt = `
你是一個「意圖分類助手」，判斷使用者是否要生成圖片。
若包含「畫、生成、圖片、設計、風景、人像、AI圖、photo、illustration」→ 輸出 { "type": "image" }
否則 → { "type": "text" }

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

    const text = await response.text();
    let type = "text";
    try {
      const json = JSON.parse(text);
      type = json?.type || "text";
    } catch {
      if (text.toLowerCase().includes("image")) type = "image";
    }

    console.log(`🧩 分析結果：「${message}」→ ${type}`);
    res.json({ type });
  } catch (err) {
    console.error("❌ /api/analyze 錯誤：", err);
    res.status(500).json({ type: "text" });
  }
});

/* === 🎨 Hugging Face 圖像生成（主模型）=== */
async function generateWithHF(prompt, options = {}) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定。");
  const model = "stabilityai/stable-diffusion-xl-base-1.0";

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/octet-stream",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        num_inference_steps: options.num_inference_steps || 30,
        guidance_scale: options.guidance_scale || 7.5,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("💥 HF 錯誤回應：", errText);
    throw new Error(`Hugging Face API 錯誤 (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/* === 🎨 智慧圖片生成（含 fallback）=== */
app.post("/api/image-smart", async (req, res) => {
  const { message } = req.body || {};
  try {
    console.log("🎨 使用者請求圖片：", message);

    const analysisRes = await fetch(`${req.protocol}://${req.get("host")}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    const analysisText = await analysisRes.text();
    let analysis = {};
    try {
      analysis = JSON.parse(analysisText);
    } catch {
      analysis = { type: "image" };
    }

    if (analysis.type !== "image")
      return res.status(400).json({ error: "這不是圖片生成請求。" });

    const prompt = `
${message}, luxury black-gold aesthetic, glowing light,
3D glossy texture, cinematic lighting, ultra-realistic, 4K render
`;

    const buffer = await generateWithHF(prompt);

    if (!buffer || buffer.length < 10000) {
      console.warn("⚠️ Hugging Face 回傳空圖，使用 fallback.png");
      const fallback = fs.readFileSync(path.join(process.cwd(), "fallback.png"));
      const { downloadUrl } = saveImageReturnUrl(fallback, req);
      return res.json({
        ok: false,
        fallback: true,
        imageBase64: `data:image/png;base64,${fallback.toString("base64")}`,
        imageUrl: downloadUrl,
        usedPrompt: prompt,
        message: "⚠️ 原圖生成失敗，顯示預設圖片。",
      });
    }

    const { downloadUrl } = saveImageReturnUrl(buffer, req);
    res.json({
      ok: true,
      fallback: false,
      usedPrompt: prompt,
      imageBase64: `data:image/png;base64,${buffer.toString("base64")}`,
      imageUrl: downloadUrl,
    });
  } catch (err) {
    console.error("💥 /api/image-smart 錯誤：", err);
    try {
      const fallback = fs.readFileSync(path.join(process.cwd(), "fallback.png"));
      const { downloadUrl } = saveImageReturnUrl(fallback, req);
      res.json({
        ok: false,
        fallback: true,
        imageBase64: `data:image/png;base64,${fallback.toString("base64")}`,
        imageUrl: downloadUrl,
        message: "⚠️ Inspiro AI 無法生成圖片，使用預設圖。",
      });
    } catch {
      res.status(500).json({ error: "⚠️ 圖片生成與備援失敗。" });
    }
  }
});

/* === 📁 靜態檔案（CORS 強化）=== */
app.use(
  "/generated",
  express.static("generated", {
    setHeaders: (res, filePath) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (filePath.endsWith(".png")) res.setHeader("Content-Type", "image/png");
    },
  })
);

/* === 🧹 自動清理舊圖片（3 小時）=== */
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

/* === 💤 Railway 防休眠 Ping === */
setInterval(async () => {
  try {
    await fetch("https://inspiro-ai-server-production.up.railway.app/");
    console.log("💤 Inspiro AI still alive", new Date().toLocaleTimeString());
  } catch {
    console.warn("⚠️ Railway ping 失敗");
  }
}, 60 * 1000);
