/* === 💎 Inspiro AI · v6.0 (正式穩定版) ===
   ✅ 管理員自動通過
   ✅ Pollinations → HF 備援圖像生成
   ✅ 完整跨域 Cookie + Session 支援
   ✅ Gemini + Mistral + SD 三層容錯
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

const app = express();
const MemoryStore = memorystore(session);
app.set("trust proxy", 1);

/* === ⚙️ 環境變數 === */
const isProd = process.env.NODE_ENV === "production";
const { GEMINI_API_KEY, HF_TOKEN } = process.env;
const ADMINS = ["admin@inspiro.ai", "studio@inspiro.ai"];
const users = []; // 模擬資料庫

/* === 🌍 允許跨域來源 === */
const ALLOWED_ORIGINS = [
  "https://amphibian-hyperboloid-z7dj.squarespace.com",
  "https://www.inspiroai.com",
  "https://inspiroai.com",
  "https://inspiro-ai-server-production.up.railway.app",
];

/* === 🌐 CORS 設定 === */
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, ALLOWED_ORIGINS.includes(origin));
  },
  credentials: true,
}));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  next();
});
app.options("*", (_, res) => res.sendStatus(200));
app.use(bodyParser.json({ limit: "10mb" }));

/* === 🔐 Session === */
app.use(session({
  store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
  secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
  name: "inspiro.sid",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    maxAge: 6 * 60 * 60 * 1000, // 6 小時
    sameSite: "none",
    secure: isProd,
    httpOnly: true,
  },
}));

/* === 🧠 Inspiro AI 人格 === */
const INSPIRO_PERSONA = `
你是「Inspiro AI」，一位優雅、有靈感、具設計感的智能夥伴。
語氣要溫潤、有詩意、具精品氣質。
請用中文回覆。
`;

/* === 工具 === */
function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir); }
function saveImage(buf, req) {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
}
function isImageRequest(text) {
  return /(畫|圖|生成|photo|picture|art|illustration|設計|image)/i.test(text);
}

/* === Session 狀態 === */
app.get("/api/session", (req, res) => {
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  if (req.session.user)
    return res.json({ loggedIn: true, user: req.session.user });
  return res.json({ loggedIn: false });
});

/* === 登入 === */
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.json({ ok: false, msg: "請輸入帳號。" });

  // 👑 管理員免密碼登入
  if (ADMINS.includes(email)) {
    req.session.regenerate(err => {
      if (err) return res.json({ ok: false, msg: "Session 錯誤。" });
      req.session.user = { email, plan: "admin" };
      req.session.save(() => {
        console.log("🟢 管理員登入成功：", email);
        res.json({ ok: true, msg: "管理員登入成功", role: "admin" });
      });
    });
    return;
  }

  // 🧍 一般會員
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.json({ ok: false, msg: "帳號或密碼錯誤。" });

  req.session.regenerate(err => {
    if (err) return res.json({ ok: false, msg: "Session 錯誤。" });
    req.session.user = { email, plan: user.plan || "free" };
    req.session.save(() => {
      console.log("🟢 會員登入成功：", email);
      res.json({ ok: true, msg: "登入成功", role: user.plan });
    });
  });
});

/* === 登出 === */
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("inspiro.sid", { sameSite: "none", secure: isProd });
    res.json({ ok: true, msg: "已登出。" });
  });
});

/* === 登入檢查中介層 === */
function requireLogin(req, res, next) {
  const email = req.session.user?.email;
  if (ADMINS.includes(email)) return next(); // 👑 管理員免檢查
  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      reply: "⚠️ 請先登入或註冊會員後再使用 Inspiro AI。",
    });
  }
  next();
}

/* === Gemini 對話 === */
async function chatWithGemini(message) {
  if (!GEMINI_API_KEY) return null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${INSPIRO_PERSONA}\n使用者說：${message}` }] }],
        }),
      }
    );
    const data = await r.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    console.warn("⚠️ Gemini 失敗：", err.message);
    return null;
  }
}

/* === Mistral 備援 === */
async function chatWithMistral(message) {
  if (!HF_TOKEN) return null;
  try {
    const prompt = `${INSPIRO_PERSONA}\n請以優雅中文回覆：${message}`;
    const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 300, temperature: 0.9 } }),
    });
    const data = await r.json();
    const txt = data?.[0]?.generated_text?.trim();
    return txt ? txt.replace(/^Inspiro AI[:：]?\s*/i, "").trim() : null;
  } catch (err) {
    console.warn("⚠️ Mistral 失敗：", err.message);
    return null;
  }
}

/* === Pollinations → HF 備援 === */
async function drawWithPollinations(prompt) {
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${prompt}, luxury black-gold, cinematic lighting`
    )}`;
    const img = await fetch(url);
    if (!img.ok) throw new Error("Pollinations 生成失敗");
    return Buffer.from(await img.arrayBuffer());
  } catch (err) {
    console.warn("⚠️ Pollinations 失敗，改用 Hugging Face：", err.message);
    const hf = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: `${prompt}, elegant luxury black-gold cinematic lighting, masterpiece`,
      }),
    });
    if (!hf.ok) throw new Error("Hugging Face 圖像生成失敗");
    return Buffer.from(await hf.arrayBuffer());
  }
}

/* === 主生成端點 === */
app.post("/api/generate", requireLogin, async (req, res) => {
  try {
    const { message } = req.body || {};
    const user = req.session.user;
    if (!message?.trim()) return res.json({ ok: false, reply: "⚠️ 請輸入內容。" });

    if (isImageRequest(message)) {
      const buffer = await drawWithPollinations(message);
      const url = saveImage(buffer, req);
      return res.json({ ok: true, mode: "image", imageUrl: url });
    }

    let reply = await chatWithGemini(message);
    if (!reply) reply = await chatWithMistral(message);
    if (!reply) reply = "💡 Inspiro AI 暫時繁忙，請稍後再試。";

    res.json({ ok: true, mode: "text", reply, role: user?.plan || "free" });
  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err.message);
    res.status(500).json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆。" });
  }
});

/* === 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v6.0 運行中 · Port ${PORT}`);
});
