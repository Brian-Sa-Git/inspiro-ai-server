/* === 🧩 引入模組 === */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch";

/* === 🧱 建立伺服器 === */
const app = express();
app.use(cors());
app.use(bodyParser.json());

/* === 🔐 安全設定 === */
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

/* === 🧩 Gemini AI 對話設定 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const INSPRIRO_SYSTEM_PROMPT = `
你是 Inspiro AI，一個高級靈感創作助理。
請注意：
1️⃣ 你只能以「Inspiro AI」自稱。
2️⃣ 不可以提及「Google」、「Gemini」、「API」等技術詞。
3️⃣ 回覆風格應優雅、有創意，像精品品牌一樣。
`;

/* === 🌐 根路徑測試 === */
app.get("/", (req, res) => {
  res.send(`✅ Inspiro AI Server 已啟動（模型：${MODEL}）`);
});

/* === 🤖 Gemini 對話 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ reply: "⚠️ Inspiro AI 金鑰未設定。" });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
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

/* === 🎨 Inspiro AI 雙引擎圖片生成 API（Gemini + OpenAI 自動切換）=== */
app.post("/api/image", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({ error: "⚠️ 請提供清楚的圖片描述內容。" });
    }

    // === 優先使用 OpenAI ===
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      console.log("🟢 使用 OpenAI gpt-image-1 生成圖片");

      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: prompt,
            size: "1024x1024",
          }),
        });

        const openaiData = await openaiResponse.json();

        if (openaiData?.data?.[0]?.url) {
          return res.json({
            source: "openai",
            image: openaiData.data[0].url,
          });
        } else {
          console.error("⚠️ OpenAI 回傳異常：", openaiData);
        }
      } catch (err) {
        console.error("💥 OpenAI 生成失敗，改用 Gemini：", err);
      }
    }

    // === 沒有 OpenAI，就改用 Gemini ===
    const GEMINI_IMAGE_KEY = process.env.GEMINI_API_KEY;
    const MODEL_IMAGE = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
    if (!GEMINI_IMAGE_KEY) {
      return res.status(500).json({ error: "⚠️ 尚未設定任何圖片 API 金鑰。" });
    }

    console.log("🟡 使用 Gemini 生成圖片");

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_IMAGE}:generateContent?key=${GEMINI_IMAGE_KEY}`;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `請生成一張圖片：「${prompt}」。請以 base64 編碼輸出，不要附任何文字說明。` }],
        },
      ],
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const geminiData = await geminiResponse.json();
    const base64Image =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!base64Image) {
      console.error("⚠️ Gemini 沒有回傳圖片內容：", JSON.stringify(geminiData, null, 2));
      return res.status(500).json({ error: "⚠️ Gemini 沒有回傳圖片內容。" });
    }

    return res.json({
      source: "gemini",
      image: `data:image/png;base64,${base64Image}`,
    });
  } catch (err) {
    console.error("💥 Inspiro AI 圖片生成錯誤：", err);
    res.status(500).json({ error: "⚠️ Inspiro AI 圖片生成失敗" });
  }
});

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI Server running on port ${PORT}`);
  console.log("🌍 狀態檢查：AI 模型 =", MODEL);
});

/* === 💤 防止 Railway 自動休眠 === */
setInterval(() => {
  console.log("💤 Inspiro AI still alive at", new Date().toLocaleTimeString());
  fetch("https://inspiro-ai-server-production.up.railway.app/").catch(() => {});
}, 60 * 1000);
