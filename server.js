/* === 💎 Inspiro AI · v4.6 (隱形 Gemini 對話引擎 + 多引擎圖像生成) ===
   💬 對話核心：Gemini 1.5 Flash（完全隱藏）
   🎨 圖像生成順序：Pollinations → Hugging Face → Stable Diffusion
   ✨ 品牌人格：Inspiro AI（高質感、精品風）
   作者：Inspiro AI Studio（2025）
=================================================================== */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* === 🏗️ 初始化 === */
const app = express();
const MemoryStore = memorystore(session);

app.use(cors({
  origin: [
    "https://amphibian-hyperboloid-z7dj.squarespace.com",
    "https://www.inspiroai.com",
  ],
  credentials: true,
}));
app.use(bodyParser.json({ limit: "10mb" }));

/* === 🧠 Session === */
app.use(session({
  store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
  cookie: { maxAge: 6 * 60 * 60 * 1000 },
  secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
  resave: false,
  saveUninitialized: true,
}));

/* === 📂 靜態資料夾 === */
app.use("/generated", express.static("generated"));

/* === 🔑 環境變數 === */
const { GEMINI_API_KEY, LOCAL_SD_URL, HF_TOKEN } = process.env;

/* === 💎 每日限制 === */
const LIMIT = { free: 10, silver: 25, gold: 999 };

/* === 🎨 工具 === */
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); };
const saveImage = (buf, req) => {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
};

/* === 🧠 Inspiro AI 人格設定（品牌語氣）=== */
const INSPIRO_PERSONA = `
你是「Inspiro AI」，一位優雅、有靈感、具設計感的智能夥伴。
你的語氣要溫潤、有詩意，但不生硬或機械。
不要提到技術、API、模型名稱。
對使用者的回覆像是精品顧問、靈感導師，使用中文回覆。
`;

/* === 🌐 自動翻譯（可選）=== */
async function translateToEnglish(text) {
  try {
    const res = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=zh|en");
    const data = await res.json();
    return data?.responseData?.translatedText || text;
  } catch {
    return text;
  }
}

/* === 🎨 Pollinations 圖像生成 === */
async function drawWithPollinations(prompt) {
  console.log("🎨 Pollinations 生成...");
  const translated = await translateToEnglish(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${translated}, luxury black-gold, cinematic, soft lighting`
  )}`;
  const img = await fetch(url);
  if (!img.ok) throw new Error("Pollinations 無法生成");
  const buf = Buffer.from(await img.arrayBuffer());
  console.log("✅ Pollinations 成功生成");
  return buf;
}

/* === 🎨 Hugging Face 備援圖像生成 === */
async function drawWithHFImage(prompt) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  console.log("🎨 Hugging Face 生成...");
  const res = await fetch("https://api-inference.huggingface.co/models/prompthero/openjourney", {
    method: "POST",
    headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: `${prompt}, cinematic lighting, ultra detail` }),
  });
  if (!res.ok) throw new Error(`Hugging Face 錯誤：${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* === 🎨 Stable Diffusion 自架（第三層）=== */
async function drawWithLocalSD(prompt) {
  if (!LOCAL_SD_URL) throw new Error("未設定 LOCAL_SD_URL");
  console.log("🎨 Stable Diffusion 生成...");
  const res = await fetch(`${LOCAL_SD_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 25, width: 768, height: 768 }),
  });
  const data = await res.json();
  if (!data.images?.[0]) throw new Error("本地 SD 無返回圖像");
  console.log("✅ Stable Diffusion 成功生成圖片");
  return Buffer.from(data.images[0], "base64");
}

/* === 💬 Gemini 對話核心 === */
async function chatWithGemini(message) {
  if (!GEMINI_API_KEY) return "⚠️ Inspiro AI 暫時無法回覆（未設定 GEMINI_API_KEY）。";

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${INSPIRO_PERSONA}\n\n使用者說：${message}` }] }],
    }),
  });

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Inspiro AI 暫時無法回覆。";
  return text.trim();
}

/* === 🎯 判斷是否為圖像請求 === */
function isImageRequest(text) {
  return /(畫|圖|生成|photo|picture|art|illustration|風景|設計)/i.test(text);
}

/* === 🎨 主 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ ok: false, reply: "⚠️ 請輸入內容。" });

    if (!req.session.userPlan) req.session.userPlan = "free";
    const plan = req.session.userPlan;
    const used = req.session.usage?.imageCount || 0;

    // 🎨 若為圖像請求
    if (isImageRequest(message)) {
      if (used >= LIMIT[plan]) return res.json({ ok: false, reply: "⚠️ 今日已達上限。" });

      let buffer = null;
      let engine = null;

      try {
        buffer = await drawWithPollinations(message);
        engine = "Pollinations.AI";
      } catch {
        try {
          buffer = await drawWithHFImage(message);
          engine = "Hugging Face";
        } catch {
          buffer = await drawWithLocalSD(message);
          engine = "Stable Diffusion WebUI";
        }
      }

      req.session.usage = { imageCount: used + 1 };
      const url = saveImage(buffer, req);
      return res.json({ ok: true, mode: "image", engine, imageUrl: url });
    }

    // 💬 若為對話請求 → Gemini 驅動
    const reply = await chatWithGemini(message);
    res.json({ ok: true, mode: "text", reply });

  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆。" });
  }
});

/* === ❤️ 健康檢查 === */
app.get("/health", (_req, res) => {
  res.json({
    status: "✅ Running",
    gemini: !!GEMINI_API_KEY,
    hf: !!HF_TOKEN,
    local_sd: !!LOCAL_SD_URL,
    time: new Date().toLocaleString(),
  });
});

/* === 🚀 啟動 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v4.6 · Gemini Dialogue Core 運行中於 port ${PORT}`);
});
