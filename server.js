/* === 💎 Inspiro AI · GPT Ultra Plus v4.5 (智慧多引擎模式：對話 + 圖像生成) ===
   🧠 功能：
   - 自動判斷「聊天」或「生成圖片」
   - 圖像引擎順序：Pollinations → Hugging Face → Stable Diffusion（自架）
   - 自動將中文翻譯成英文以提升生成準確度
   - 對話模式使用 Hugging Face (Kimi-K2)
   ✨ 作者：Inspiro AI Studio（2025）
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
const { HF_TOKEN, LOCAL_SD_URL } = process.env;

/* === 💎 每日限制 === */
const LIMIT = { free: 10, silver: 25, gold: 999 };

/* === 🧠 系統人格提示 === */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅、有靈感、具設計感的智能助理。
請用高質感、溫柔、有靈性的語氣回答。
`;

/* === 🧰 工具 === */
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); };
const saveImage = (buf, req) => {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
};

/* === 🌐 自動翻譯（簡易英翻中）=== */
async function translateToEnglish(text) {
  try {
    const res = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=zh|en");
    const data = await res.json();
    return data?.responseData?.translatedText || text;
  } catch {
    return text; // 若翻譯失敗則回傳原文
  }
}

/* === 🎨 1️⃣ Pollinations.AI 免費生成 === */
async function drawWithPollinations(prompt) {
  console.log("🎨 使用 Pollinations.AI 生成...");
  const translated = await translateToEnglish(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${translated}, luxury black-gold aesthetic, cinematic lighting`
  )}`;
  const img = await fetch(url);
  if (!img.ok) throw new Error("Pollinations 無法生成");
  const buf = Buffer.from(await img.arrayBuffer());
  console.log("✅ Pollinations 成功生成");
  return buf;
}

/* === 🎨 2️⃣ Hugging Face Inference API === */
async function drawWithHFImage(prompt) {
  if (!HF_TOKEN) throw new Error("未設定 HF_TOKEN");
  console.log("🎨 使用 Hugging Face 生成圖片...");
  const translated = await translateToEnglish(prompt);
  const res = await fetch("https://api-inference.huggingface.co/models/prompthero/openjourney", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: `${translated}, cinematic lighting, ultra detail, 4K` }),
  });
  if (!res.ok) throw new Error(`Hugging Face 錯誤：${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("✅ Hugging Face 成功生成圖片");
  return buf;
}

/* === 🎨 3️⃣ Stable Diffusion WebUI（自架伺服器） === */
async function drawWithLocalSD(prompt) {
  if (!LOCAL_SD_URL) throw new Error("未設定 LOCAL_SD_URL");
  console.log("🎨 使用本地 Stable Diffusion WebUI 生成...");
  const translated = await translateToEnglish(prompt);
  const res = await fetch(`${LOCAL_SD_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `${translated}, luxury black-gold, ultra detail, cinematic`,
      steps: 25,
      width: 768,
      height: 768,
    }),
  });
  const data = await res.json();
  if (!data.images?.[0]) throw new Error("本地 SD 無返回圖像");
  console.log("✅ Stable Diffusion WebUI 成功生成圖片");
  return Buffer.from(data.images[0], "base64");
}

/* === 💬 Hugging Face 對話模型 === */
async function chatWithHF(message) {
  if (!HF_TOKEN) return "⚠️ Inspiro AI 暫時無法回覆（未設定 HF_TOKEN）。";
  const res = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "moonshotai/Kimi-K2-Instruct-0905",
      messages: [
        { role: "system", content: SYS_PROMPT },
        { role: "user", content: message },
      ],
    }),
  });
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "⚠️ Inspiro AI 暫時無法回覆。";
}

/* === 🎯 判斷是否為圖像請求 === */
function isImageRequest(text) {
  return /(畫|圖|生成|photo|picture|art|illustration|design|city|風景|角色)/i.test(text);
}

/* === 🎨 主生成 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ ok: false, reply: "⚠️ 請輸入內容。" });

    if (!req.session.userPlan) req.session.userPlan = "free";
    const plan = req.session.userPlan;
    const used = req.session.usage?.imageCount || 0;

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
          try {
            buffer = await drawWithLocalSD(message);
            engine = "Stable Diffusion WebUI";
          } catch (err3) {
            console.error("💥 三層備援全失敗：", err3.message);
            return res.json({ ok: false, reply: "⚠️ Inspiro AI 無法生成圖片，請稍後再試。" });
          }
        }
      }

      req.session.usage = { imageCount: used + 1 };
      const url = saveImage(buffer, req);
      return res.json({
        ok: true,
        mode: "image",
        engine,
        usedCount: `${used + 1}/${LIMIT[plan]}`,
        imageUrl: url,
      });
    }

    // 💬 對話模式
    const reply = await chatWithHF(message);
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
    hf_token: !!HF_TOKEN,
    local_sd: !!LOCAL_SD_URL,
    time: new Date().toLocaleString(),
  });
});

/* === 🚀 啟動 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v4.5 · 智慧多引擎模式 運行中於 port ${PORT}`);
});
