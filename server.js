/* === 💎 Inspiro AI · GPT Ultra Plus v3.9 (Final Stable Build) ===
   整合 Stability + Fal + Hugging Face + Gemini
   功能：Squarespace 會員同步、每日次數限制、自動備援接力、錯誤修復與日誌偵錯
   作者：Inspiro AI Studio（2025）
================================================ */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* === 🏗️ App 初始化 === */
const app = express();
const DEBUG = true;
const log = (step, msg) => { if (DEBUG) console.log(`🪶 [${step}]`, msg); };

/* === 🌍 CORS 設定 === */
app.use(cors({
  origin: [
    "https://amphibian-hyperboloid-z7dj.squarespace.com",
    "https://www.inspiroai.com",
  ],
  credentials: true,
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

/* === 📁 靜態圖片資料夾 === */
app.use(
  "/generated",
  express.static("generated", {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
    },
  })
);

/* === 🔑 環境變數 === */
const {
  GEMINI_API_KEY,
  HF_TOKEN,
  FAL_TOKEN,
  STABILITY_API_KEY,
  GEMINI_MODEL = "gemini-2.0-flash",
} = process.env;

/* === 💎 每日使用上限 === */
const DAILY_LIMITS = { free: 10, silver: 25, gold: 999 };

/* === 🧾 系統提示 === */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅且具創意的精品級智能助理。
請遵守：
1️⃣ 回覆簡潔、有靈感且具品味。
2️⃣ 若需生成圖片，請用精確英文提示詞。
3️⃣ 禁止提及技術字（如 API、模型名、伺服器）。
4️⃣ 所有回覆須自然流暢、有設計感與情感溫度。
`;

/* === 🧰 共用工具 === */
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); };
const saveImage = (buf, req) => {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
};

const fetchWithTimeout = (url, options = {}, ms = 60000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
};

/* === 💬 Hugging Face Chat === */
async function chatWithHF(prompt) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  const r = await fetchWithTimeout("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "moonshotai/Kimi-K2-Instruct-0905",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HF Chat 錯誤: ${r.status}`);
  return data?.choices?.[0]?.message?.content || "⚠️ 無回覆內容。";
}

/* === 🎨 Stability AI === */
async function drawWithStability(prompt) {
  if (!STABILITY_API_KEY) throw new Error("STABILITY_API_KEY 未設定");

  const formData = new FormData();
  formData.append("prompt", `${prompt}, luxury black-gold aesthetic, cinematic glow, ultra-detailed, 4K render`);
  formData.append("output_format", "png");
  formData.append("width", "768");
  formData.append("height", "768");
  formData.append("cfg_scale", "7");
  formData.append("samples", "1");

  const res = await fetchWithTimeout("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${STABILITY_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stability 錯誤 (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const base64 = data?.artifacts?.[0]?.base64;
  if (!base64) throw new Error("Stability AI 無返回圖像");
  log("✅ Stability 成功生成", base64.slice(0, 50));
  return Buffer.from(base64, "base64");
}

/* === 🎨 Fal.ai 備援 === */
async function drawWithFAL(prompt) {
  if (!FAL_TOKEN) throw new Error("FAL_TOKEN 未設定");

  const res = await fetchWithTimeout("https://fal.run/fal-ai/flux-pro", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `${prompt}, luxury black-gold cinematic style, soft lighting, detailed 4K render`,
      num_inference_steps: 25,
      guidance_scale: 7,
    }),
  });

  const data = await res.json().catch(() => ({}));
  const imgUrl = data?.images?.[0]?.url;
  if (!imgUrl) throw new Error("Fal.ai 無返回圖片 URL");
  log("✅ Fal.ai 成功 URL", imgUrl);

  const imgRes = await fetchWithTimeout(imgUrl);
  return Buffer.from(await imgRes.arrayBuffer());
}

/* === 🎨 Hugging Face 備援 === */
async function drawWithHF(prompt) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");

  const res = await fetchWithTimeout("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!res.ok) throw new Error(`HF 圖像錯誤: ${await res.text()}`);
  log("✅ Hugging Face 成功生成影像");
  return Buffer.from(await res.arrayBuffer());
}

/* === 👥 Squarespace 會員同步 === */
app.post("/api/setplan", (req, res) => {
  const { email, plan } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: "缺少會員 Email" });
  const userPlan = /silver/i.test(plan) ? "silver" : /gold/i.test(plan) ? "gold" : "free";
  req.session.userEmail = email;
  req.session.userPlan = userPlan;
  console.log(`👤 會員登入：${email}（方案：${userPlan}）`);
  res.json({ ok: true, userPlan });
});

/* === 📊 會員資訊查詢 === */
app.get("/api/userinfo", (req, res) => {
  const plan = req.session.userPlan || "free";
  const used = req.session.usage?.imageCount || 0;
  const limit = DAILY_LIMITS[plan];
  const label = plan === "gold" ? "👑 黃金鑽石會員"
    : plan === "silver" ? "💠 銀鑽石會員"
    : "💎 免費會員";
  res.json({ plan, used, limit, label });
});

/* === 🎨 /api/generate 主核心 === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message, mode } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ reply: "⚠️ 請輸入內容。" });

    if (!req.session.userPlan) req.session.userPlan = "free";
    const today = new Date().toDateString();
    if (!req.session.usage || req.session.usage.date !== today)
      req.session.usage = { imageCount: 0, date: today };

    const plan = req.session.userPlan;
    const limit = DAILY_LIMITS[plan];
    const used = req.session.usage.imageCount;

    const isImage = /(畫|生成|圖片|插畫|海報|illustration|design|image)/i.test(message);
    if (isImage || mode === "image") {
      if (used >= limit)
        return res.json({ ok: false, mode: "limit", reply: `⚠️ 今日已達上限（${used}/${limit}）請升級方案或明日再試。` });

      // Gemini 轉英文提示
      const gRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${SYS_PROMPT}\n請將以下描述轉為英文繪圖提示：${message}` }] }],
          }),
        }
      );

      const gData = await gRes.json().catch(() => ({}));
      const englishPrompt = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || message;
      const finalPrompt = `${englishPrompt}, elegant 4K render, golden accents, cinematic lighting`;

      let buffer = null;
      let engineUsed = null;

      try {
        buffer = await drawWithStability(finalPrompt);
        engineUsed = "Stability AI";
      } catch (err1) {
        console.warn("⚠️ Stability 失敗 → Fal 備援", err1.message);
      }

      if (!buffer) {
        try {
          buffer = await drawWithFAL(finalPrompt);
          engineUsed = "Fal.ai";
        } catch (err2) {
          console.warn("⚠️ Fal.ai 失敗 → Hugging Face 備援", err2.message);
        }
      }

      if (!buffer) {
        try {
          buffer = await drawWithHF(finalPrompt);
          engineUsed = "Hugging Face";
        } catch (err3) {
          console.error("💥 所有生成引擎皆失敗", err3.message);
          return res.json({ ok: false, mode: "error", reply: "⚠️ Inspiro AI 暫時無法生成圖片，請稍後再試。" });
        }
      }

      req.session.usage.imageCount++;
      const url = saveImage(buffer, req);
      return res.json({
        ok: true,
        mode: "image",
        engine: engineUsed,
        usedPrompt: finalPrompt,
        usedCount: `${req.session.usage.imageCount}/${limit}`,
        imageUrl: url,
        imageBase64: `data:image/png;base64,${buffer.toString("base64")}`,
      });
    }

    // 💬 文字模式
    const context = `${SYS_PROMPT}\n使用者輸入：${message}`;
    const reply = await chatWithHF(context);
    res.json({ ok: true, mode: "text", reply });

  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ mode: "error", reply: "⚠️ Inspiro AI 暫時無法回覆，請稍後再試。", error: String(err.message) });
  }
});

/* === ❤️ Health Check === */
app.get("/health", (_req, res) => {
  res.json({
    status: "✅ Inspiro AI 運行中",
    stability: !!STABILITY_API_KEY,
    fal: !!FAL_TOKEN,
    hf: !!HF_TOKEN,
    gemini: !!GEMINI_API_KEY,
    time: new Date().toLocaleString(),
  });
});

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Inspiro AI · GPT Ultra Plus v3.9 正在執行於 port ${PORT}`));
