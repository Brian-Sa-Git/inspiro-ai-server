/* === 💎 Inspiro AI · GPT Ultra (整合 Fal.ai + Hugging Face + Gemini + Squarespace會員同步 + 次數限制) === */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const app = express();

/* === 🌍 CORS 設定：只允許 Inspiro 網域 === */
app.use(cors({
  origin: [
    "https://amphibian-hyperboloid-z7dj.squarespace.com",
    "https://www.inspiroai.com"
  ],
  credentials: true
}));

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
const FAL_TOKEN = process.env.FAL_TOKEN;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/* === 💎 每日使用上限 === */
const DAILY_LIMITS = {
  free: 10,
  silver: 25,
  gold: 999,
};

/* === 🧾 系統提示 === */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅且具創意的精品級智能助理。
請遵守：
1️⃣ 回覆簡潔、有靈感且具品味。
2️⃣ 若需生成圖片，請用精確英文提示詞。
3️⃣ 禁止提及 Google、Gemini、API 等技術字。
4️⃣ 所有回覆須自然流暢、有設計感。
`;

/* === 🧰 工具函式 === */
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); };
const saveImage = (buf, req) => {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
};

/* === 💬 Hugging Face Chat === */
async function chatWithHF(prompt) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  const r = await fetch("https://router.huggingface.co/v1/chat/completions", {
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

/* === 🎨 Fal.ai 圖像生成 === */
async function drawWithFAL(prompt) {
  if (!FAL_TOKEN) throw new Error("FAL_TOKEN 未設定");
  const model = "fal-ai/flux-pro/context";
  const url = `https://fal.run/fal-ai/${model}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Key ${FAL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: `${prompt}, luxury black-gold style, cinematic glow, detailed lighting, 4K render`,
      num_inference_steps: 25,
      guidance_scale: 7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Fal.ai 錯誤 (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  const imgUrl = data?.images?.[0]?.url;
  if (!imgUrl) throw new Error("Fal.ai 無返回圖片連結。");

  const imgRes = await fetch(imgUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return buf;
}

/* === 🎨 Hugging Face 備援圖像生成 === */
async function drawWithHF(prompt, options = {}) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  const model = options.model || "black-forest-labs/FLUX.1-dev";
  const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Hugging Face 圖像錯誤 (${res.status}): ${errText.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/* === 👥 Squarespace 會員同步 === */
app.post("/api/setplan", (req, res) => {
  const { email, plan } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: "缺少會員 Email" });

  let userPlan = "free";
  if (/silver/i.test(plan)) userPlan = "silver";
  if (/gold/i.test(plan)) userPlan = "gold";

  req.session.userEmail = email;
  req.session.userPlan = userPlan;
  console.log(`👤 已登入會員：${email}（方案：${userPlan}）`);
  res.json({ ok: true, userPlan });
});

/* === 會員資訊查詢 === */
app.get("/api/userinfo", (req, res) => {
  const plan = req.session.userPlan || "free";
  const used = req.session.usage?.imageCount || 0;
  const limit = DAILY_LIMITS[plan] || 10;
  const label =
    plan === "gold"
      ? "👑 黃金鑽石會員"
      : plan === "silver"
      ? "💠 銀鑽石會員"
      : "💎 免費會員";
  res.json({ plan, used, limit, label });
});

/* === 主核心 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message, mode, imageOptions } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ reply: "⚠️ 請輸入內容。" });

    if (!req.session.userPlan) req.session.userPlan = "free";
    if (!req.session.usage)
      req.session.usage = { imageCount: 0, date: new Date().toDateString() };

    const today = new Date().toDateString();
    if (req.session.usage.date !== today) {
      req.session.usage = { imageCount: 0, date: today };
    }

    const plan = req.session.userPlan;
    const limit = DAILY_LIMITS[plan] || 10;
    const used = req.session.usage.imageCount;

    const isImage = /(畫|生成|圖片|插畫|海報|illustration|design|image)/i.test(message);

    if (isImage || mode === "image") {
      if (used >= limit) {
        return res.json({
          ok: false,
          mode: "limit",
          reply: `⚠️ 你的「${plan}」今日圖片生成次數已用完（${used}/${limit}）。請升級方案或明日再試。`,
        });
      }

      req.session.usage.imageCount++;

      const rPrompt = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${SYS_PROMPT}\n請將以下描述轉為具體英文繪圖提示詞：${message}` }] }],
          }),
        }
      );

      const dataPrompt = await rPrompt.json().catch(() => ({}));
      const englishPrompt = dataPrompt?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || message;
      const finalPrompt = `${englishPrompt}, luxury black-gold aesthetic, cinematic glow, detailed 4K`;

      let buffer;
      try {
        buffer = await drawWithFAL(finalPrompt); // 🎨 先試 Fal.ai
      } catch (falErr) {
        console.warn("⚠️ Fal.ai 失敗，改用 Hugging Face 備援：", falErr.message);
        buffer = await drawWithHF(finalPrompt, imageOptions);
      }

      const url = saveImage(buffer, req);
      return res.json({
        ok: true,
        mode: "image",
        usedPrompt: finalPrompt,
        usedCount: `${req.session.usage.imageCount}/${limit}`,
        imageUrl: url,
        imageBase64: `data:image/png;base64,${buffer.toString("base64")}`,
      });
    }

    // ✨ 文字模式
    const context = `${SYS_PROMPT}\n使用者輸入：${message}`;
    const reply = await chatWithHF(context);
    res.json({ ok: true, mode: "text", reply });

  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ mode: "error", reply: "⚠️ Inspiro AI 暫時無法回覆。", error: String(err.message) });
  }
});

/* === 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Inspiro AI · GPT Ultra (Fal+HF) 正在執行於 port ${PORT}`));
