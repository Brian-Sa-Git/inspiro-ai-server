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
    if (!GEMINI_API_KEY)
      return res.status(500).json({ reply: "⚠️ Inspiro AI 金鑰未設定。" });
    if (!message || !message.trim())
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
    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "🤖 Inspiro AI 暫時沒有回覆內容。";
    res.json({ reply: aiText });
  } catch (err) {
    console.error("💥 Inspiro AI 對話錯誤：", err);
    res.status(500).json({ reply: "⚠️ Inspiro AI 發生暫時錯誤。" });
  }
});

/* === 🛠️ 工具函式 === */
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
  const downloadUrl = `${base}/generated/${fileName}`;
  return { fileName, downloadUrl };
}

/* === 🖼️ Hugging Face 圖像生成 === */
async function generateWithHF(prompt, options = {}) {
  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) return null;
  const {
    negative_prompt = "",
    num_inference_steps = 30,
    guidance_scale = 7.5,
    seed,
  } = options;

  const model = "stabilityai/stable-diffusion-xl-base-1.0";
  const body = {
    inputs: prompt,
    parameters: {
      negative_prompt,
      num_inference_steps,
      guidance_scale,
      ...(seed ? { seed } : {}),
    },
  };

  const resp = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!resp.ok) throw new Error(`HF API Error: ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/* === 🧠 智慧語意分析 API（升級版）=== */
app.post("/api/analyze", async (req, res) => {
  const { message } = req.body;
  try {
    const prompt = `
你是一個「輸入意圖分類助手」，請分析使用者想要什麼：
- 若他說「生成、畫、圖、照片、image、設計、illustration」等相關字眼，
  回覆：
  {
    "type": "image",
    "topic": "貓、風景、人像等主題",
    "style": "寫實、動漫、黑金精品等風格",
    "emotion": "優雅、科技感、神秘等氛圍"
  }

- 若不是圖片需求（如問問題、請解釋、聊對話），
  回覆：
  { "type": "text" }

請務必輸出標準 JSON，禁止多餘文字。
使用者輸入：${message}
`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });

    const data = await response.json();
    let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let result;
    try {
      const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0];
      result = JSON.parse(jsonStr);
    } catch {
      result = { type: "text" };
    }
    if (!result.type) result.type = "text";

    console.log("🧩 分析結果：", result);
    res.json(result);
  } catch (err) {
    console.error("❌ /api/analyze 錯誤：", err);
    res.status(500).json({ type: "text" });
  }
});

/* === 🎨 智慧圖片生成 API === */
app.post("/api/image-smart", async (req, res) => {
  const { message } = req.body;
  try {
    const analyzeRes = await fetch(
      `${req.protocol}://${req.get("host")}/api/analyze`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }
    );
    const analysis = await analyzeRes.json();

    const finalPrompt = `
Generate a high-quality image of ${analysis.topic || "subject"},
style: ${analysis.style || "luxury black-gold aesthetic"},
mood: ${analysis.emotion || "elegant and cinematic"},
high detail, soft glowing light, 3D glossy texture, ultra-realistic, 4K.
`;

    console.log("🎨 最終提示詞：", finalPrompt);
    const buffer = await generateWithHF(finalPrompt, {
      num_inference_steps: 30,
      guidance_scale: 7.5,
    });
    const { downloadUrl } = saveImageReturnUrl(buffer, req);
    const base64 = buffer.toString("base64");
    res.json({
      imageBase64: `data:image/png;base64,${base64}`,
      imageUrl: downloadUrl,
      usedPrompt: finalPrompt,
    });
  } catch (err) {
    console.error("❌ /api/image-smart 錯誤：", err);
    res.status(500).json({ error: "生成失敗" });
  }
});

/* === 📁 靜態資料夾 === */
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

/* === 🧹 自動清理舊圖片 === */
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
        console.log(`🧹 刪除舊檔案 ${file}`);
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
    console.warn("⚠️ Railway ping 失敗");
  }
}, 60 * 1000);
