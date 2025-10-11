/* =========================================
 🌟 Inspiro AI Server — 修正版
 適用 Railway，防 timeout、修 fetch、穩定啟動
========================================= */

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch"; // 🟢 你之前漏這行（必要，不然會報錯）

const app = express();

/* === 允許 Squarespace 前端跨域呼叫 === */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

/* === 避免重複 X-Frame-Options === */
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  next();
});

/* === 安全性標頭補強 === */
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https: data: blob:; connect-src 'self' https://amphibian-hyperboloid-z7dj.squarespace.com https://generativelanguage.googleapis.com; img-src 'self' https: data:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:;"
  );
  next();
});

app.use(bodyParser.json());

/* === 啟用登入 session === */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "inspiro-secret",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

/* === Inspiro AI 金鑰與模型設定 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/* === 系統人格設定 === */
const INSPRIRO_SYSTEM_PROMPT = `
你是 Inspiro AI，一個高級靈感創作助理。
請注意：
1️⃣ 你只能以「Inspiro AI」自稱。
2️⃣ 不可以提及「Google」、「Gemini」、「API」、「模型」等技術詞。
3️⃣ 回覆風格應優雅、有創意，像精品品牌一樣。
`;

/* === 根路徑測試（這行讓 Railway 檢查你有在運作） === */
app.get("/", (req, res) => {
  res.send(`✅ Inspiro AI Server is running. 模型：${MODEL}`);
});

/* === Chat API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 金鑰未設定，請稍後再試。",
      });
    }

    const apiVersion = "v1beta";
    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: `${INSPRIRO_SYSTEM_PROMPT}\n\n使用者訊息：${message}` },
          ],
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
    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "🤖 Inspiro AI 暫時沒有回覆內容。";

    res.json({ reply: aiText });
  } catch (err) {
    console.error("💥 Inspiro AI 錯誤：", err);
    res.status(500).json({ reply: "⚠️ Inspiro AI 發生暫時錯誤，請稍後再試。" });
  }
});

/* === Google 登入設定 === */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "missing",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "missing",
      callbackURL:
        "https://inspiro-ai-server-production.up.railway.app/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  )
);

/* === Facebook 登入設定 === */
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID || "missing",
      clientSecret: process.env.FACEBOOK_APP_SECRET || "missing",
      callbackURL:
        "https://inspiro-ai-server-production.up.railway.app/auth/facebook/callback",
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

/* === 登入路由 === */
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("https://amphibian-hyperboloid-z7dj.squarespace.com/login-success")
);

app.get("/auth/facebook", passport.authenticate("facebook"));
app.get(
  "/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/" }),
  (req, res) => res.redirect("https://amphibian-hyperboloid-z7dj.squarespace.com/login-success")
);

/* === 啟動伺服器（簡化版，防 timeout） === */
// 🟢 把你原本的 startServer() 改成這樣（不再重啟 port，Railway 會自己管理）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Inspiro AI Server Running on port ${PORT}`));
