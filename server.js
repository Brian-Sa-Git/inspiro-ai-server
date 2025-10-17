/* === 💎 Inspiro AI · v6.4.1 (多語圖像生成修正版) ===
   ✅ 自動判斷語言（中文→英文翻譯後再生成）
   ✅ Pollinations 忽略中文問題修正
   ✅ 自動備援 DeepAI / HuggingFace
   ✅ 保留黑金精品風格與自動清理
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

const isProd = process.env.NODE_ENV === "production";
const { GEMINI_API_KEY, HF_TOKEN, DEEPAI_KEY } = process.env;
const ADMINS = ["admin@inspiro.ai", "studio@inspiro.ai"];
const users = [];

const ALLOWED_ORIGINS = [
  "https://amphibian-hyperboloid-z7dj.squarespace.com",
  "https://www.inspiroai.com",
  "https://inspiroai.com",
  "https://inspiro-ai-server-production.up.railway.app",
];
app.use(cors({ origin: (o, cb) => cb(null, !o || ALLOWED_ORIGINS.includes(o)), credentials: true }));
app.use(bodyParser.json({ limit: "10mb" }));

app.use(session({
  store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
  secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
  name: "inspiro.sid",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: { sameSite: "none", secure: isProd, httpOnly: true, maxAge: 6 * 60 * 60 * 1000 },
}));

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
function isImageRequest(t) { return /(畫|圖|生成|photo|picture|art|illustration|設計|image)/i.test(t); }

/* === 🔠 翻譯工具：中文自動轉英文 === */
async function translateToEnglish(text) {
  try {
    const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=zh-CN|en");
    const data = await r.json();
    return data.responseData.translatedText || text;
  } catch {
    return text;
  }
}

/* === 🎨 多引擎生成 === */
async function drawWithPollinations(prompt) {
  try {
    const langPrompt = /[\u4e00-\u9fa5]/.test(prompt)
      ? await translateToEnglish(prompt)
      : prompt;

    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${langPrompt}, luxury black-gold, cinematic lighting`
    )}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("Pollinations 錯誤");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 5000) throw new Error("Pollinations 回傳空圖");
    console.log("🎨 Pollinations 成功");
    return { buf, engine: "Pollinations" };
  } catch (e) {
    console.warn("⚠️ Pollinations 失敗：", e.message);
    throw e;
  }
}
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
      body: JSON.stringify({ inputs: `${prompt}, elegant luxury black-gold cinematic lighting` }),
    });
    if (!r.ok) throw new Error("HF 回傳失敗");
    const buf = Buffer.from(await r.arrayBuffer());
    console.log("🎨 HuggingFace 成功");
    return { buf, engine: "HuggingFace" };
  } catch (e) { console.warn("⚠️ HF 失敗：", e.message); throw e; }
}

/* === 生成 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message?.trim()) return res.json({ ok: false, reply: "⚠️ 請輸入內容。" });

    if (isImageRequest(message)) {
      let result;
      try { result = await drawWithPollinations(message); }
      catch { try { result = await drawWithDeepAI(message); }
      catch { result = await drawWithHuggingFace(message); } }

      const imageUrl = saveImage(result.buf);
      return res.json({ ok: true, mode: "image", engine: result.engine, imageUrl });
    }

    res.json({ ok: true, mode: "text", reply: "💬 Inspiro AI 已準備就緒。" });
  } catch (e) {
    console.error("💥 /api/generate 錯誤：", e.message);
    res.status(500).json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆。" });
  }
});

/* === 靜態檔案輸出 === */
app.use("/generated", express.static(GENERATED_PATH));

/* === 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Inspiro AI v6.4.1 運行中（多語出圖修正版） Port ${PORT}`)
);
