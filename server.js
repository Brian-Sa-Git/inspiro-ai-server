/* === 💎 Inspiro AI · v4.9 (強制會員註冊 + 管理員模式) ===
   💬 Gemini + Mistral 雙引擎
   🔐 登入 / 註冊 / 管理員免限制
   🚪 未登入者無法使用任何生成功能
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

/* === ⚙️ 基本設定 === */
app.use(cors({
  origin: [
    "https://amphibian-hyperboloid-z7dj.squarespace.com",
    "https://www.inspiroai.com",
    "https://inspiro-ai-server-production.up.railway.app"
  ],
  credentials: true,
}));
app.use(bodyParser.json({ limit: "10mb" }));

app.use(session({
  store: new MemoryStore({ checkPeriod: 6 * 60 * 60 * 1000 }),
  cookie: { maxAge: 6 * 60 * 60 * 1000 },
  secret: process.env.SESSION_SECRET || "inspiro-ultra-secret",
  resave: false,
  saveUninitialized: true,
}));

app.use("/generated", express.static("generated"));

/* === 🔑 環境變數 === */
const { GEMINI_API_KEY, HF_TOKEN, LOCAL_SD_URL } = process.env;

/* === 👑 管理員帳號 === */
const ADMINS = [
  { email: "admin@inspiro.ai", password: "goldmaster" },
  { email: "studio@inspiro.ai", password: "diamondkey" }
];

/* === 🧍‍♂️ 使用者暫存資料 === */
const users = []; // 模擬資料庫：{ email, password, plan }

/* === 🧠 Inspiro Persona === */
const INSPIRO_PERSONA = `
你是「Inspiro AI」，一位優雅、有靈感、具設計感的智能夥伴。
語氣要溫潤、有詩意、帶有精品氣質。
不要提及技術、模型名稱。
`;

/* === 💬 Gemini 對話 === */
async function chatWithGemini(message) {
  if (!GEMINI_API_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${INSPIRO_PERSONA}\n使用者說：${message}` }] }],
        }),
      }
    );
    const data = await res.json();
    if (data?.promptFeedback?.blockReason) return null;
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return reply?.length > 3 ? reply : null;
  } catch {
    return null;
  }
}

/* === 🔮 Mistral 備援 === */
async function chatWithMistral(message) {
  if (!HF_TOKEN) return null;
  try {
    const prompt = `${INSPIRO_PERSONA}\n\n請以自由創作語氣回覆：${message}`;
    const res = await fetch(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 300, temperature: 0.9 },
        }),
      }
    );
    const data = await res.json();
    const text = data?.[0]?.generated_text?.trim() || null;
    return text ? text.replace(/^Inspiro AI[:：]?\s*/i, "").trim() : null;
  } catch {
    return null;
  }
}

/* === 🎨 工具 === */
function isImageRequest(text) {
  return /(畫|圖|生成|photo|picture|art|illustration|設計|image)/i.test(text);
}
const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir); };
const saveImage = (buf, req) => {
  const folder = path.join(process.cwd(), "generated");
  ensureDir(folder);
  const name = `inspiro-${Date.now()}.png`;
  fs.writeFileSync(path.join(folder, name), buf);
  return `${req.protocol}://${req.get("host")}/generated/${name}`;
};

/* === 🔐 註冊 === */
app.post("/api/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "請輸入完整資料。" });

  if (users.find(u => u.email === email)) {
    return res.json({ ok: false, msg: "此帳號已存在。" });
  }

  users.push({ email, password, plan: "free" });
  console.log("🆕 新會員註冊：", email);
  res.json({ ok: true, msg: "註冊成功，請登入。" });
});

/* === 🔑 登入 === */
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ ok: false, msg: "請輸入帳號密碼。" });

  const admin = ADMINS.find(a => a.email === email && a.password === password);
  const user = users.find(u => u.email === email && u.password === password);

  if (admin) {
    req.session.user = { email, plan: "admin" };
    return res.json({ ok: true, msg: "管理員登入成功", role: "admin" });
  }
  if (user) {
    req.session.user = { email, plan: user.plan };
    return res.json({ ok: true, msg: "登入成功", role: user.plan });
  }

  return res.json({ ok: false, msg: "帳號或密碼錯誤。" });
});

/* === 🚪 登出 === */
app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ ok: true, msg: "已登出。" });
});

/* === 🧠 強制登入檢查 === */
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      reply: "⚠️ 請先註冊或登入會員後再使用 Inspiro AI。",
      redirect: "/register"
    });
  }
  next();
}

/* === 💬 主 AI 端點（需登入） === */
app.post("/api/generate", requireLogin, async (req, res) => {
  try {
    const { message } = req.body || {};
    const user = req.session.user;
    const isAdmin = user.plan === "admin";

    if (!message?.trim()) return res.json({ ok: false, reply: "⚠️ 請輸入內容。" });
    if (!req.session.usage) req.session.usage = { imageCount: 0 };

    // 🎨 圖像請求
    if (isImageRequest(message)) {
      if (!isAdmin && req.session.usage.imageCount >= 10)
        return res.json({ ok: false, reply: "⚠️ 免費會員今日已達上限。" });

      const img = await drawWithPollinations(message);
      req.session.usage.imageCount++;
      const url = saveImage(img, req);
      return res.json({ ok: true, mode: "image", imageUrl: url });
    }

    // 💬 對話請求
    let reply = await chatWithGemini(message);
    if (!reply) reply = await chatWithMistral(message);
    if (!reply) reply = "💡 Inspiro AI 正在整理靈感，請稍後再試。";

    res.json({ ok: true, mode: "text", reply, role: user.plan });
  } catch (err) {
    console.error("💥 /api/generate 錯誤：", err);
    res.status(500).json({ ok: false, reply: "⚠️ Inspiro AI 暫時無法回覆。" });
  }
});

/* === ❤️ 健康檢查 === */
app.get("/api/health", (_req, res) => {
  res.json({
    status: "✅ Running",
    gemini: !!GEMINI_API_KEY,
    mistral: !!HF_TOKEN,
    admins: ADMINS.map(a => a.email),
    time: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
  });
});

/* === 🚀 啟動 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v4.9 · 強制註冊會員模式運行中 · port ${PORT}`);
});
