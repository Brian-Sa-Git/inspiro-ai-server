/* === 💎 Inspiro AI · v5.7 (登入優化最終穩定版) ===
   ✅ 進入網站不需註冊，使用 AI 時才需登入
   ✅ 支援 Squarespace / Google / Facebook / 自註冊
   ✅ 管理員免密碼登入
   ✅ CORS + Cookie + Session 全面穩定
   💬 Gemini + Mistral 雙引擎
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

/* === ⚙️ 環境設定 === */
const isProd = process.env.NODE_ENV === "production";
const { GEMINI_API_KEY, HF_TOKEN } = process.env;
const ADMINS = ["admin@inspiro.ai", "studio@inspiro.ai"];
const users = []; // 模擬會員資料庫

app.set("trust proxy", 1);

/* === 🌐 CORS 設定 === */
const ALLOWED_ORIGINS = [
  "https://amphibian-hyperboloid-z7dj.squarespace.com",
  "https://www.inspiroai.com",
  "https://inspiroai.com",
  "https://inspiro-ai-server-production.up.railway.app",
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, ALLOWED_ORIGINS.includes(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  exposedHeaders: ["set-cookie"],
}));

// ⭐ 所有回應都帶上 CORS 標頭
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }
  next();
});

app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  return res.sendStatus(200);
});

app.use(bodyParser.json({ limit: "10mb" }));

/* === 🔐 Session 設定 === */
app.use(session({
  store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
  secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
  name: "inspiro.sid",
  resave: false,
  saveUninitialized: false,
  proxy: true,
  rolling: true,
  cookie: {
    maxAge: 6 * 60 * 60 * 1000, // 6 小時
    sameSite: "none",
    secure: isProd,
    httpOnly: true,
  },
}));

/* === 靜態輸出資料夾 === */
app.use("/generated", express.static("generated"));

/* === Inspiro AI 人格設定 === */
const INSPIRO_PERSONA = `
你是「Inspiro AI」，一位優雅、有靈感、具設計感的智能夥伴。
語氣要溫潤、有詩意、帶有精品氣質。
請用中文回覆。
`;

/* === 工具函式 === */
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
  console.log("📦 Session 檢查：", req.session.user);
  if (req.session.user) return res.json({ loggedIn: true, user: req.session.user });
  return res.json({ loggedIn: false });
});

/* === 註冊 === */
app.post("/api/register", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.json({ ok: false, msg: "請輸入完整資料。" });
  if (users.find(u => u.email === email)) return res.json({ ok: false, msg: "此帳號已存在。" });

  users.push({ email, password, plan: "free" });
  console.log("🆕 新會員註冊：", email);
  return res.json({ ok: true, msg: "註冊成功，請登入。" });
});

/* === 登入（含管理員免密碼） === */
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email) return res.json({ ok: false, msg: "請輸入帳號。" });

  // 👑 管理員免密碼登入
  if (ADMINS.includes(email)) {
    req.session.regenerate(err => {
      if (err) return res.json({ ok: false, msg: "Session 錯誤。" });
      req.session.user = { email, plan: "admin" };
      req.session.save(() => {
        console.log("👑 管理員登入成功：", email);
        res.json({ ok: true, msg: "管理員登入成功", role: "admin" });
      });
    });
    return;
  }

  // 🧍 一般會員登入
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.json({ ok: false, msg: "帳號或密碼錯誤。" });

  req.session.regenerate(err => {
    if (err) return res.json({ ok: false, msg: "Session 錯誤。" });
    req.session.user = { email, plan: user.plan || "free" };
    req.session.save(() => {
      console.log("✅ 會員登入成功：", email);
      res.json({ ok: true, msg: "登入成功" });
    });
  });
});

/* === OAuth 登入（Google / Facebook / Squarespace） === */
app.post("/api/oauth-login", (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.json({ ok: false, msg: "無效的登入資料。" });
  req.session.user = { email, plan: "free" };
  req.session.save(() => {
    console.log("🌐 OAuth 登入成功：", email);
    res.json({ ok: true, msg: "OAuth 登入成功" });
  });
});

/* === 登出 === */
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("inspiro.sid", {
      sameSite: "none",
      secure: isProd,
      httpOnly: true,
    });
    res.json({ ok: true, msg: "已登出。" });
  });
});

/* === 登入檢查中介層（僅生成端點使用） === */
function requireLogin(req, res, next) {
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
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return txt?.length > 3 ? txt : null;
  } catch {
    return null;
  }
}

/* === Mistral 備援 === */
async function chatWithMistral(message) {
  if (!HF_TOKEN) return null;
  try {
    const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: `${INSPIRO_PERSONA}\n請以自由創作語氣回覆：${message}`,
        parameters: { max_new_tokens: 300, temperature: 0.9 },
      }),
    });
    const data = await r.json();
    const txt = data?.[0]?.generated_text?.trim() || null;
    return txt ? txt.replace(/^Inspiro AI[:：]?\s*/i, "").trim() : null;
  } catch {
    return null;
  }
}

/* === 圖像生成 === */
async function drawWithPollinations(prompt) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${prompt}, luxury black-gold, cinematic lighting`
  )}`;
  const img = await fetch(url);
  if (!img.ok) throw new Error("Pollinations 生成失敗");
  return Buffer.from(await img.arrayBuffer());
}

/* === 主生成端點（需登入） === */
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
    if (!reply) reply = "💡 Inspiro AI 正在整理靈感，請稍後再試。";

    res.json({ ok: true, mode: "text", reply, role: user.plan });
  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆。" });
  }
});

/* === 健康檢查 === */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "✅ Running",
    env: isProd ? "production" : "development",
    gemini: !!GEMINI_API_KEY,
    mistral: !!HF_TOKEN,
    admins: ADMINS,
    time: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
  });
});

/* === 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v5.7 運行中於 port ${PORT}`);
});
