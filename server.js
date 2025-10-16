/* === 💎 Inspiro AI · GPT Ultra Plus v4.1 (Stable Deployment Build) ===
   功能：主力 Stability AI、備援 Fal.ai（新版 Bearer Token）、自動重試、
        Squarespace 會員同步 + 日誌提示 + 健康檢查
   作者：Inspiro AI Studio（2025）
====================================================================== */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import memorystore from "memorystore";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import FormData from "form-data";

/* === 🏗️ 初始化設定 === */
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

/* === 🧠 Session 記憶（6 小時）=== */
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
const { STABILITY_API_KEY, FAL_TOKEN, GEMINI_API_KEY } = process.env;

/* === 💎 使用次數上限 === */
const LIMIT = { free: 10, silver: 25, gold: 999 };

/* === 🧠 系統提示（可擴充）=== */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅且具創意的精品級智能助理。
請以簡潔、有設計感、有靈感的方式回覆。
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
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* === 🎨 Stability AI（主力生成）=== */
async function drawWithStability(prompt) {
  if (!STABILITY_API_KEY) throw new Error("STABILITY_API_KEY 未設定");
  
  const form = new FormData();
  form.append("prompt", `${prompt}, luxury black-gold aesthetic, cinematic lighting, ultra-detailed, 4K render`);
  form.append("output_format", "png");
  form.append("width", "768");
  form.append("height", "768");
  form.append("cfg_scale", "7");

  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { Authorization: `Bearer ${STABILITY_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Stability AI 錯誤 (${res.status}): ${errText.slice(0, 120)}`);
  }

  const data = await res.json();
  const base64 = data?.artifacts?.[0]?.base64;
  if (!base64) throw new Error("Stability 無返回圖像");
  console.log("✅ Stability 生成成功");
  return Buffer.from(base64, "base64");
}

/* === 🎨 Fal.ai（新版 Bearer Token 備援）=== */
async function drawWithFal(prompt) {
  if (!FAL_TOKEN) throw new Error("FAL_TOKEN 未設定");

  const res = await fetch("https://fal.run/fal-ai/flux-pro-1.1", {
    method: "POST",
    headers: { 
      Authorization: `Bearer ${FAL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: `${prompt}, cinematic golden light, black luxury aesthetic, detailed render`,
      num_inference_steps: 25,
      guidance_scale: 7,
    }),
  });

  const data = await res.json().catch(() => ({}));
  const imgUrl = data?.images?.[0]?.url;
  if (!imgUrl) throw new Error("Fal.ai 無圖片 URL");

  const imgRes = await fetch(imgUrl);
  console.log("✅ Fal.ai 備援成功生成");
  return Buffer.from(await imgRes.arrayBuffer());
}

/* === 👥 Squarespace 會員同步 === */
app.post("/api/setplan", (req, res) => {
  const { email, plan } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: "缺少會員 Email" });
  const level = /gold/i.test(plan) ? "gold" : /silver/i.test(plan) ? "silver" : "free";
  req.session.userPlan = level;
  req.session.userEmail = email;
  console.log(`👤 會員登入：${email}（方案：${level}）`);
  res.json({ ok: true, plan: level });
});

/* === 📊 使用者資訊 === */
app.get("/api/userinfo", (req, res) => {
  const plan = req.session.userPlan || "free";
  const used = req.session.usage?.imageCount || 0;
  res.json({ plan, used, limit: LIMIT[plan] });
});

/* === 🎨 主生成 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ ok: false, reply: "⚠️ 請輸入內容。" });

    const plan = req.session.userPlan || "free";
    const used = req.session.usage?.imageCount || 0;
    if (used >= LIMIT[plan]) {
      return res.json({ ok: false, reply: `⚠️ 今日已達上限 (${used}/${LIMIT[plan]})` });
    }

    let buffer = null;
    let engine = "Stability AI";

    try {
      buffer = await drawWithStability(message);
    } catch (e1) {
      console.warn("⚠️ Stability 失敗，切換 Fal.ai 備援...", e1.message);
      await delay(1000);
      try {
        buffer = await drawWithFal(message);
        engine = "Fal.ai";
      } catch (e2) {
        console.error("💥 Fal.ai 也失敗：", e2.message);
        return res.json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法生成圖片，請稍後再試。" });
      }
    }

    req.session.usage = { imageCount: used + 1 };
    const url = saveImage(buffer, req);
    res.json({ ok: true, mode: "image", engine, usedCount: `${used + 1}/${LIMIT[plan]}`, imageUrl: url });

  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ ok: false, reply: `⚠️ Inspiro AI 錯誤：${err.message}` });
  }
});

/* === ❤️ 健康檢查 === */
app.get("/health", (_req, res) => {
  res.json({
    status: "✅ Inspiro AI 運行中",
    stability: !!STABILITY_API_KEY,
    fal: !!FAL_TOKEN,
    time: new Date().toLocaleString(),
  });
});

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v4.1 · Stability + Fal.ai 已啟動於 port ${PORT}`);
});
