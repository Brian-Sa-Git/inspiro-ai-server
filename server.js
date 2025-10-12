/* === 🧩 模組匯入 === */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";               // ✅ 正確使用 memorystore 的 default 匯入
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* === 🧱 建立伺服器 === */
const app = express();
app.use(cors());
app.use(bodyParser.json());

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
    cookie: { maxAge: 24 * 60 * 60 * 1000 },           // 1 天
    store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
    secret: process.env.SESSION_SECRET || "inspiro-secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

/* === 🧩 Gemini 對話設定 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
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

/* === 🤖 Gemini 對話 API（文字）=== */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ reply: "⚠️ Inspiro AI 金鑰未設定。" });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ reply: "⚠️ 請輸入對話內容。" });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        { role: "user", parts: [{ text: `${INSPRIRO_SYSTEM_PROMPT}\n\n使用者訊息：${message}` }] },
      ],
      generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "🤖 Inspiro AI 暫時沒有回覆內容。";
    res.json({ reply: aiText });
  } catch (err) {
    console.error("💥 Inspiro AI 對話錯誤：", err);
    res.status(500).json({ reply: "⚠️ Inspiro AI 發生暫時錯誤。" });
  }
});

/* === 🛠️ 小工具：確保資料夾存在 === */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath);
}

/* === 🛠️ 小工具：建檔並回傳下載網址 === */
function saveImageReturnUrl(buffer, req) {
  const folderPath = path.join(process.cwd(), "generated");
  ensureDir(folderPath);
  const fileName = `inspiro-${Date.now()}.png`;
  const filePath = path.join(folderPath, fileName);
  fs.writeFileSync(filePath, buffer);
  const base = `${req.protocol}://${req.get("host")}`;
  const downloadUrl = `${base}/generated/${fileName}`;
  return { fileName, downloadUrl };
}

/* === 🖼️ 圖像生成：Hugging Face（主要路徑，最貼近指令） === */
async function generateWithHF(prompt, options = {}) {
  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return null;

  // 常見、易理解的參數（不同模型支援度略有差異，但大多可用）
  const {
    negative_prompt = "",
    num_inference_steps = 30,
    guidance_scale = 7.5,
    seed,                     // 可不給
  } = options;

  const model = "stabilityai/stable-diffusion-xl-base-1.0";
  const body = {
    inputs: prompt,           // ✅ 只使用使用者指令，不強加風格
    parameters: {
      negative_prompt,
      num_inference_steps,
      guidance_scale,
      ...(seed ? { seed } : {}),
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

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`HF API Error: ${resp.status} ${errText}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/* === 🖼️ 圖像生成：Gemini（實驗性，若回傳非圖片會自動跳過） === */
async function tryGenerateWithGemini(prompt) {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const MODEL_IMAGE = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
  if (!GEMINI_KEY) return null;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_IMAGE}:generateContent?key=${GEMINI_KEY}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: `請生成一張圖片：「${prompt}」。請以 base64 編碼輸出。` }] }],
  };

  const r = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  let base64Image =
    data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!base64Image) return null;

  base64Image = base64Image.replace(/[\r\n\s]/g, "");
  // 確認真的是 Base64
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Image)) return null;

  return Buffer.from(base64Image, "base64");
}

/* === 🎨 圖片生成 API（嚴格依照你的指令）=== */
app.post("/api/image", async (req, res) => {
  try {
    let { prompt, negative, steps, guidance, seed } = req.body || {};

    // 防呆
    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({ error: "⚠️ 請提供清楚的圖片描述內容。" });
    }

    console.log(`🎨 生成圖片：${prompt}`);

    // 1) 先試 Gemini（可能回不出圖，成功就用）
    let buffer = null;
    try {
      buffer = await tryGenerateWithGemini(prompt);
      if (buffer) console.log("🟡 Gemini 生成成功（使用其結果）");
    } catch (e) {
      console.warn("Gemini 生成失敗，改用 Hugging Face：", e.message);
    }

    // 2) 再用 Hugging Face（主要路徑，最穩）
    if (!buffer) {
      buffer = await generateWithHF(prompt, {
        negative_prompt: negative || "",
        num_inference_steps: Number(steps) || 30,
        guidance_scale: Number(guidance) || 7.5,
        seed, // 可選
      });
      console.log("🔵 Hugging Face 生成成功");
    }

    // 存檔並回傳
    const { downloadUrl } = saveImageReturnUrl(buffer, req);
    const base64 = buffer.toString("base64");

    return res.json({
      ok: true,
      imageBase64: `data:image/png;base64,${base64}`, // ✅ 前端直接預覽
      imageUrl: downloadUrl,                           // ✅ 點擊即可下載
      engine: buffer ? "huggingface-or-gemini" : "unknown",
      message: "✅ 成功生成圖片",
    });
  } catch (err) {
    console.error("💥 圖片生成錯誤：", err);
    return res.status(500).json({ error: "⚠️ Inspiro AI 無法生成圖片，請稍後再試。" });
  }
});

/* === 📁 靜態資料夾：提供圖片下載（CORS + MIME）=== */
app.use(
  "/generated",
  express.static("generated", {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Content-Type", "image/png");
    },
  })
);

/* === 🧹 自動清理舊圖片（每 3 小時清理超過 3 小時的檔案）=== */
setInterval(() => {
  const folderPath = path.join(process.cwd(), "generated");
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  if (!fs.existsSync(folderPath)) return;

  const now = Date.now();
  for (const file of fs.readdirSync(folderPath)) {
    try {
      const filePath = path.join(folderPath, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > THREE_HOURS) {
        fs.unlinkSync(filePath);
        console.log(`🧹 自動清理：刪除舊檔案 ${file}`);
      }
    } catch {}
  }
}, 3 * 60 * 60 * 1000);

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI Server running on port ${PORT}`);
  console.log("🌍 狀態檢查：AI 模型 =", MODEL);
});

/* === 💤 防止 Railway 自動休眠 === */
setInterval(async () => {
  try {
    await fetch("https://inspiro-ai-server-production.up.railway.app/");
    console.log("💤 Inspiro AI still alive at", new Date().toLocaleTimeString());
  } catch {
    console.warn("⚠️ Railway ping 失敗（可能暫時離線）");
  }
}, 60 * 1000);
