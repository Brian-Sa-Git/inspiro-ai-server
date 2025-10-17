/* === 💎 Inspiro AI · v6.5 (智能圖像引擎正式版) ===
   ✅ 智能語言判斷（中文→DeepAI，英文→Pollinations）
   ✅ 含關鍵詞自動切換 HuggingFace
   ✅ 自動清理舊圖，只保留最新 100 張
   ✅ 全引擎回傳黑金精品風格圖像
   ✅ 完整相容 v6.4 前端
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
const { GEMINI_API_KEY, HF_TOKEN, DEEPAI_KEY } = process.env;
const ADMINS = ["admin@inspiro.ai", "studio@inspiro.ai"];
const users = [];

/* === 🌐 CORS 設定 === */
const ALLOWED_ORIGINS = [
  "https://amphibian-hyperboloid-z7dj.squarespace.com",
  "https://www.inspiroai.com",
  "https://inspiroai.com",
  "https://inspiro-ai-server-production.up.railway.app",
];
app.use(
  cors({
    origin: (o, cb) => cb(null, !o || ALLOWED_ORIGINS.includes(o)),
    credentials: true,
  })
);
app.use(bodyParser.json({ limit: "10mb" }));

/* === 🔐 Session === */
app.use(
  session({
    store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
    secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
    name: "inspiro.sid",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      sameSite: "none",
      secure: isProd,
      httpOnly: true,
      maxAge: 6 * 60 * 60 * 1000,
    },
  })
);

/* === 📁 圖像資料夾管理 === */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GENERATED_PATH = path.join(__dirname, "generated");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
}
function cleanupOldImages(limit = 100) {
  ensureDir(GENERATED_PATH);
  const files = fs
    .readdirSync(GENERATED_PATH)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({
      name: f,
      time: fs.statSync(path.join(GENERATED_PATH, f)).mtime.getTime(),
    }))
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

/* === 🧠 工具 === */
function isImageRequest(text) {
  return /(畫|圖|生成|photo|picture|art|illustration|設計|image)/i.test(text);
}

/* === 🔠 翻譯工具（中文→英文） === */
async function translateToEnglish(text) {
  try {
    const r = await fetch(
      "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(text) +
        "&langpair=zh-CN|en"
    );
    const data = await r.json();
    return data.responseData.translatedText || text;
  } catch {
    return text;
  }
}

/* === 🎨 各引擎 === */
async function drawWithPollinations(prompt) {
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
}

async function drawWithDeepAI(prompt) {
  const form = new FormData();
  form.append("text", prompt);
  const r = await fetch("https://api.deepai.org/api/text2img", {
    method: "POST",
    headers: { "api-key": DEEPAI_KEY },
    body: form,
  });
  const data = await r.json();
  if (!data.output_url) throw new Error("DeepAI 無圖回傳");
  const img = await fetch(data.output_url);
  const buf = Buffer.from(await img.arrayBuffer());
  console.log("🎨 DeepAI 成功");
  return { buf, engine: "DeepAI" };
}

async function drawWithHuggingFace(prompt) {
  const r = await fetch(
    "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: `${prompt}, elegant luxury black-gold cinematic lighting`,
      }),
    }
  );
  if (!r.ok) throw new Error("HuggingFace 失敗");
  const buf = Buffer.from(await r.arrayBuffer());
  console.log("🎨 HuggingFace 成功");
  return { buf, engine: "HuggingFace" };
}

/* === 🧩 智能選擇引擎 === */
async function smartDraw(prompt) {
  const lower = prompt.toLowerCase();
  const isChinese = /[\u4e00-\u9fa5]/.test(prompt);
  const isArtStyle = /(fantasy|surreal|style|design|構圖|藝術|風格|插畫)/i.test(
    prompt
  );

  if (isArtStyle) return await drawWithHuggingFace(prompt);
  if (isChinese) return await drawWithDeepAI(prompt);
  return await drawWithPollinations(prompt);
}

/* === 🧠 主生成端點 === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message?.trim())
      return res.json({ ok: false, reply: "⚠️ 請輸入內容。" });

    if (isImageRequest(message)) {
      let result;
      try {
        result = await smartDraw(message);
      } catch {
        try {
          result = await drawWithDeepAI(message);
        } catch {
          result = await drawWithHuggingFace(message);
        }
      }

      const imageUrl = saveImage(result.buf);
      return res.json({
        ok: true,
        mode: "image",
        engine: result.engine,
        imageUrl,
      });
    }

    res.json({
      ok: true,
      mode: "text",
      reply: "💬 Inspiro AI 已準備就緒。",
    });
  } catch (e) {
    console.error("💥 /api/generate 錯誤：", e.message);
    res
      .status(500)
      .json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆。" });
  }
});

/* === 🖼️ 靜態檔案路由 === */
app.use("/generated", express.static(GENERATED_PATH));

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 Inspiro AI v6.5 運行中（智能圖像引擎版） Port ${PORT}`)
);
