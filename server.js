/* === 💎 Inspiro AI · GPT Ultra Plus v4.3 (智慧雙模式：對話 + 圖像生成) ===
   功能：自動判斷使用者是要「聊天」或「生成圖片」
   主力 Stability AI（圖像）+ 備援 Fal.ai
   對話模式使用 Hugging Face (Kimi-K2)
   作者：Inspiro AI Studio（2025）
=========================================================== */

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
    "https://www.inspiroai.com"
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
const { STABILITY_API_KEY, FAL_TOKEN, HF_TOKEN } = process.env;

/* === 💎 每日限制 === */
const LIMIT = { free: 10, silver: 25, gold: 999 };

/* === 🧠 系統人格提示 === */
const SYS_PROMPT = `
你是「Inspiro AI」，一位優雅、有靈感、具設計感的智能助理。
請用高質感、溫柔、有靈性的語氣回答。
避免提到技術、API、模型名稱。
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

/* === 🎨 Stability AI 圖像生成 === */
async function drawWithStability(prompt) {
  const form = new FormData();
  form.append("prompt", `${prompt}, luxury black-gold aesthetic, cinematic lighting, ultra detail, 4K render`);
  form.append("output_format", "png");
  form.append("width", "768");
  form.append("height", "768");
  form.append("cfg_scale", "7");

  const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STABILITY_API_KEY}`,
      Accept: "application/json"
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Stability 錯誤 (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const base64 = data?.artifacts?.[0]?.base64;
  if (!base64) throw new Error("⚠️ Stability 無返回圖像");
  console.log("✅ Stability 成功生成");
  return Buffer.from(base64, "base64");
}

/* === 🎨 Fal.ai 備援引擎 === */
async function drawWithFal(prompt) {
  const res = await fetch("https://fal.run/fal-ai/flux-pro", {
    method: "POST",
    headers: { Authorization: `Key ${FAL_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `${prompt}, cinematic golden light, black luxury aesthetic, detailed render`,
      num_inference_steps: 25,
      guidance_scale: 7,
    }),
  });

  const data = await res.json().catch(() => ({}));
  const imgUrl = data?.images?.[0]?.url;
  if (!imgUrl) throw new Error("Fal.ai 無圖片 URL");
  console.log("✅ Fal.ai 成功生成圖片 URL");

  const imgRes = await fetch(imgUrl);
  return Buffer.from(await imgRes.arrayBuffer());
}

/* === 💬 Hugging Face 對話模型 === */
async function chatWithHF(message) {
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

/* === 🎯 智慧模式判斷 === */
function isImageRequest(text) {
  return /(畫|圖|image|插畫|設計|生成|photo|picture|art|illustration)/i.test(text);
}

/* === 🎨 主生成 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message?.trim()) return res.status(400).json({ ok: false, reply: "⚠️ 請輸入內容。" });

    // 初始化 session
    if (!req.session.userPlan) req.session.userPlan = "free";
    const plan = req.session.userPlan;
    const used = req.session.usage?.imageCount || 0;

    // 分流判斷
    if (isImageRequest(message)) {
      if (used >= LIMIT[plan]) return res.json({ ok: false, reply: "⚠️ 今日已達上限。" });

      let buffer = null;
      let engine = null;
      try {
        buffer = await drawWithStability(message);
        engine = "Stability AI";
      } catch (e) {
        console.warn("⚠️ Stability 失敗，切換 Fal.ai...");
        try {
          buffer = await drawWithFal(message);
          engine = "Fal.ai";
        } catch (err2) {
          console.error("💥 Fal.ai 也失敗：", err2.message);
          return res.json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法生成圖片，請稍後再試。" });
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
    res.status(500).json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆，請稍後再試。" });
  }
});

/* === ❤️ 健康檢查 === */
app.get("/health", (_req, res) => {
  res.json({
    status: "✅ Running",
    stability: !!STABILITY_API_KEY,
    fal: !!FAL_TOKEN,
    hf: !!HF_TOKEN,
    time: new Date().toLocaleString(),
  });
});

/* === 🚀 啟動 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v4.3 · 對話 + 圖像模式 運行中於 port ${PORT}`);
});
