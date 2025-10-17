/* === 💎 Inspiro AI · v5.0 (會員登入系統 + 雙引擎回覆 + 管理員免限制) ===
   💬 Gemini + Mistral 雙引擎（智慧文風 / 自由創作）
   🔐 強制登入驗證，未登入者無法使用
   👑 管理員帳號（admin@inspiro.ai / studio@inspiro.ai）免密碼且無限制
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
const ADMINS = ["admin@inspiro.ai", "studio@inspiro.ai"];

/* === 🧍 模擬會員資料庫 === */
const users = []; // { email, password, plan }

/* === 🧠 Inspiro AI 人格設定 === */
const INSPIRO_PERSONA = `
你是「Inspiro AI」，一位優雅、有靈感、具設計感的智能夥伴。
語氣要溫潤、有詩意、帶有精品氣質。
不要提及技術、API、模型名稱。
請用中文回覆。
`;

/* === 🌈 工具函式 === */
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

/* === 🔐 登入狀態檢查 === */
app.get("/api/session", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

/* === 📝 註冊 === */
app.post("/api/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.json({ ok: false, msg: "請輸入完整資料。" });

  if (users.find(u => u.email === email))
    return res.json({ ok: false, msg: "此帳號已存在。" });

  users.push({ email, password, plan: "free" });
  console.log("🆕 新會員註冊：", email);
  res.json({ ok: true, msg: "註冊成功，請登入。" });
});

/* === 🔑 登入 === */
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email) return res.json({ ok: false, msg: "請輸入帳號。" });

  // 👑 管理員免密碼登入
  if (ADMINS.includes(email)) {
    req.session.user = { email, plan: "admin" };
    console.log("👑 管理員登入成功：", email);
    return res.json({ ok: true, msg: "管理員登入成功", role: "admin" });
  }

  // 🧍 一般會員登入
  const user = users.find(u => u.email === email && u.password === password);
  if (user) {
    req.session.user = { email, plan: user.plan || "free" };
    console.log("✅ 一般會員登入成功：", email);
    return res.json({ ok: true, msg: "登入成功", role: user.plan });
  }

  return res.json({ ok: false, msg: "帳號或密碼錯誤。" });
});

/* === 🚪 登出 === */
app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ ok: true, msg: "已登出。" });
});

/* === 🧠 強制登入中介層 === */
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      ok: false,
      reply: "⚠️ 請先登入或註冊會員後再使用 Inspiro AI。",
    });
  }
  next();
}

/* === 💬 Gemini 對話核心 === */
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

/* === 💬 Mistral 備援 === */
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

/* === 🎨 圖像生成 (Pollinations / HuggingFace / LocalSD) === */
async function drawWithPollinations(prompt) {
  console.log("🎨 Pollinations 生成中...");
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    `${prompt}, luxury black-gold, cinematic lighting`
  )}`;
  const img = await fetch(url);
  if (!img.ok) throw new Error("Pollinations 生成失敗");
  return Buffer.from(await img.arrayBuffer());
}

async function drawWithHFImage(prompt) {
  if (!HF_TOKEN) throw new Error("HF_TOKEN 未設定");
  console.log("🎨 Hugging Face 生成中...");
  const res = await fetch(
    "https://api-inference.huggingface.co/models/prompthero/openjourney",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: `${prompt}, cinematic lighting, ultra detail`,
      }),
    }
  );
  if (!res.ok) throw new Error("Hugging Face 生成失敗");
  return Buffer.from(await res.arrayBuffer());
}

async function drawWithLocalSD(prompt) {
  if (!LOCAL_SD_URL) throw new Error("未設定 LOCAL_SD_URL");
  console.log("🎨 Stable Diffusion 生成中...");
  const res = await fetch(`${LOCAL_SD_URL}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, steps: 25, width: 768, height: 768 }),
  });
  const data = await res.json();
  if (!data.images?.[0]) throw new Error("本地 SD 無返回圖像");
  return Buffer.from(data.images[0], "base64");
}

/* === 💬 /api/generate === */
app.post("/api/generate", requireLogin, async (req, res) => {
  try {
    const { message } = req.body || {};
    const user = req.session.user;
    const isAdmin = user.plan === "admin";
    if (!message?.trim()) return res.json({ ok: false, reply: "⚠️ 請輸入內容。" });

    // 🎨 圖像生成請求
    if (isImageRequest(message)) {
      if (!isAdmin && (user.usage || 0) >= 10)
        return res.json({ ok: false, reply: "⚠️ 免費會員今日已達上限。" });
      let buffer;
      try { buffer = await drawWithPollinations(message); }
      catch { try { buffer = await drawWithHFImage(message); }
      catch { buffer = await drawWithLocalSD(message); } }
      user.usage = (user.usage || 0) + 1;
      const url = saveImage(buffer, req);
      return res.json({ ok: true, mode: "image", imageUrl: url });
    }

    // 💬 對話生成請求
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
    admins: ADMINS,
    time: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
  });
});

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Inspiro AI v5.0 運行中於 port ${PORT}`);
});
