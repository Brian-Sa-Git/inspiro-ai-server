import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch";

const app = express();

/* === 🧱 基礎設定 === */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(bodyParser.json());

/* === 🔐 安全性標頭 === */
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

/* === 🧠 Session 設定 === */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "inspiro-secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

/* === 🧩 Gemini AI 設定 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const INSPRIRO_SYSTEM_PROMPT = `
你是 Inspiro AI，一個高級靈感創作助理。
請注意：
1️⃣ 你只能以「Inspiro AI」自稱。
2️⃣ 不可以提及或暗示「Google」、「Gemini」、「API」、「模型」等技術詞。
3️⃣ 回覆風格應優雅、有創意，像精品品牌一樣。
4️⃣ 你的任務是幫助使用者構思、寫作、靈感延伸與知識回答。
5️⃣ 若被問及身分，請回答：「我是 Inspiro AI，由創作者團隊打造的智慧靈感夥伴。」。
`;

/* === 🌐 根路徑測試 === */
app.get("/", (req, res) => {
  res.send(`✅ Inspiro AI Server 已啟動（模型：${MODEL}）`);
});

/* === 🤖 AI 對話 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ reply: "⚠️ Inspiro AI 金鑰未設定，請稍後再試。" });
    }

    const apiVersion = "v1beta";
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${INSPRIRO_SYSTEM_PROMPT}\n\n使用者訊息：${message}` }],
        },
      ],
      generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await r.json();
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "🤖 Inspiro AI 暫時沒有回覆內容。";

    return res.json({ reply: aiText });
  } catch (err) {
    console.error("💥 Inspiro AI 伺服器錯誤：", err);
    return res.status(500).json({ reply: "⚠️ Inspiro AI 發生暫時錯誤。" });
  }
});

/* === 🔑 Google 登入設定 === */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log("🔹 檢測到 Google OAuth 環境變數，正在註冊策略...");
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "https://inspiro-ai-server-production.up.railway.app/auth/google/callback",
      },
      (accessToken, refreshToken, profile, done) => done(null, profile)
    )
  );
  console.log("✅ Google 登入策略註冊完成");
} else {
  console.warn("⚠️ Google 登入未啟用（缺少 GOOGLE_CLIENT_ID 或 SECRET）");
}

/* === 🔵 Facebook 登入設定 === */
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  console.log("🔹 檢測到 Facebook OAuth 環境變數，正在註冊策略...");
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: "https://inspiro-ai-server-production.up.railway.app/auth/facebook/callback",
        profileFields: ["id", "displayName", "email", "picture.type(large)"],
      },
      (accessToken, refreshToken, profile, done) => done(null, profile)
    )
  );
  console.log("✅ Facebook 登入策略註冊完成");
} else {
  console.warn("⚠️ Facebook 登入未啟用（缺少 APP_ID 或 SECRET）");
}

/* === 🧭 Passport 序列化設定 === */
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

/* === 🚪 Google 登入路由 === */
app.get(
  "/auth/google",
  (req, res, next) => {
    if (!passport._strategy("google")) {
      console.error("❌ Google 登入策略尚未啟用");
      return res.status(500).send("⚠️ Google 登入未啟用，請確認環境變數設定。");
    }
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    console.log("🎉 Google 登入成功，導回 Squarespace 首頁");
    res.redirect("https://amphibian-hyperboloid-z7dj.squarespace.com/login-success");
  }
);

/* === 🔷 Facebook 登入路由 === */
app.get(
  "/auth/facebook",
  (req, res, next) => {
    if (!passport._strategy("facebook")) {
      console.error("❌ Facebook 登入策略尚未啟用");
      return res.status(500).send("⚠️ Facebook 登入未啟用，請確認環境變數設定。");
    }
    next();
  },
  passport.authenticate("facebook")
);

app.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/" }),
  (req, res) => {
    console.log("🎉 Facebook 登入成功，導回 Squarespace 首頁");
    res.redirect("https://amphibian-hyperboloid-z7dj.squarespace.com/login-success");
  }
);

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI Server running on port ${PORT}`);
  console.log("🌍 狀態檢查：AI 模型 =", MODEL);
});
