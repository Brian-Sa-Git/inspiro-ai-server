/* === 💎 Inspiro AI · v6.6 (全語自動翻譯精品生成版) ===
   ✅ 所有語言自動翻譯成英文再生成
   ✅ DeepAI → HuggingFace 智慧備援
   ✅ 自動清理舊圖、統一黑金精品風格
   ✅ 全面相容 Inspiro v6.4+ 前端
=================================================================== */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import { fileURLToPath } from "url";

const app = express();
const MemoryStore = memorystore(session);
app.set("trust proxy", 1);

/* === ⚙️ 環境設定 === */
const isProd = process.env.NODE_ENV === "production";
const { HF_TOKEN, DEEPAI_KEY } = process.env;

/* === 🌐 CORS 設定 === */
const ALLOWED_ORIGINS = [
  "https://amphibian-hyperboloid-z7dj.squarespace.com",
  "https://www.inspiroai.com",
  "https://inspiroai.com",
  "https://inspiro-ai-server-production.up.railway.app",
];
app.use(cors({ origin: (o, cb) => cb(null, !o || ALLOWED_ORIGINS.includes(o)), credentials: true }));
app.use(bodyParser.json({ limit: "10mb" }));

/* === 🔐 Session === */
app.use(session({
  store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
  secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
  name: "inspiro.sid",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: { sameSite: "none", secure: isProd, httpOnly: true, maxAge: 6 * 60 * 60 * 1000 },
}));

/* === 📁 圖像管理 === */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GENERATED_PATH = path.join(__dirname, "generated");

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir); }
function cleanupOldImages(limit = 100) {
  ensureDir(GENERATED_PATH);
  const files = fs.readdirSync(GENERATED_PATH).filter(f => f.endsWith(".png"))
    .map(f => ({ name: f, time: fs.statSync(path.join(GENERATED_PATH, f)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
  if (files.length > limit) {
    for (const f of files.slice(limit)) {
      fs.unlinkSync(path.join(GENERATED_PATH, f.name));
      console.log(`🧹 已清理舊圖：${f.name}`);
    }
  }
}
function saveImage(buf) {
  ensureDir(GENERATED_PATH);
  cleanupOldImages(100);
  const file = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(GENERATED_PATH, file), buf);
  return `https://inspiro-ai-server-production.up.railway.app/generated/${file}`;
}

/* === 🧠 通用工具 === */
function isImageRequest(text) {
  return /(畫|圖|生成|photo|picture|art|illustration|設計|image|圖像|繪|畫出)/i.test(text);
}

/* === 🌐 翻譯工具：自動轉英文 === */
async function translateToEnglish(text) {
  try {
    const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=auto|en");
    const data = await r.json();
    return data?.responseData?.translatedText || text;
  } catch {
    return text;
  }
}

/* === 🎨 各圖像引擎 === */
async function drawWithDeepAI(prompt) {
  try {
    const form = new FormData();
    form.append("text", prompt);
    const r = await fetch("https://api.deepai.org/api/text2img", {
      method: "POST", headers: { "api-key": DEEPAI_KEY }, body: form,
    });
    const data = await r.json();
    if (!data.output_url) throw new Error("DeepAI 無圖回傳");
    const img = await fetch(data.output_url);
    const buf = Buffer.from(await img.arrayBuffer());
    console.log("🎨 DeepAI 成功");
    return { buf, engine: "DeepAI" };
  } catch (e) { console.warn("⚠️ DeepAI 失敗：", e.message); throw e; }
}

async function drawWithHuggingFace(prompt) {
  try {
    const r = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2", {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: `${prompt}, luxury black-gold tone, cinematic lighting, ultra detailed` }),
    });
    if (!r.ok) throw new Error("HuggingFace 回傳失敗");
    const buf = Buffer.from(await r.arrayBuffer());
    console.log("🎨 HuggingFace 成功");
    return { buf, engine: "HuggingFace" };
  } catch (e) { console.warn("⚠️ HuggingFace 失敗：", e.message); throw e; }
}

/* === 🧩 自動翻譯 + 智慧生成 === */
async function smartDraw(prompt) {
  // step 1: 翻譯成英文
  const translated = await translateToEnglish(prompt);
  // step 2: 自動補精品風格
  const enhanced = `${translated}, luxury black-gold tone, cinematic lighting, elegant composition, ultra realistic`;

  // step 3: 主引擎 DeepAI → 備援 HuggingFace
  try {
    return await drawWithDeepAI(enhanced);
  } catch {
    return await drawWithHuggingFace(enhanced);
  }
}

/* === 🎯 主生成 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message?.trim()) return res.json({ ok: false, reply: "⚠️ 請輸入內容。" });

    if (isImageRequest(message)) {
      const result = await smartDraw(message);
      const imageUrl = saveImage(result.buf);
      return res.json({ ok: true, mode: "image", engine: result.engine, imageUrl });
    }

    res.json({ ok: true, mode: "text", reply: "💬 Inspiro AI 已準備就緒。" });
  } catch (e) {
    console.error("💥 /api/generate 錯誤：", e.message);
    res.status(500).json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆。" });
  }
});

/* === 🖼️ 靜態輸出 === */
app.use("/generated", express.static(GENERATED_PATH));

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Inspiro AI v6.6 運行中（全語自動翻譯精品生成版） Port ${PORT}`)
);
