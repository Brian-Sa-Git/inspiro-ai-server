/* === 🧩 模組匯入 === */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

/* === 🧱 建立伺服器 === */
const app = express();
app.use(cors());
app.use(bodyParser.json());

/* === 🔐 安全標頭設定 === */
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

/* === 🎨 Inspiro AI 三引擎圖片生成 API（即時顯示 + 自動下載）=== */
app.post("/api/image", async (req, res) => {
  try {
    let { prompt } = req.body;

    // 🧩 防呆：若未輸入主題，自動補預設
    if (!prompt || prompt.trim().length < 2) {
      console.warn("⚠️ 未提供 prompt，自動使用預設主題。");
      prompt = "AI 藝術風格圖，主題為流動的光與創意靈感，精品風格";
    }

    const timestamp = new Date().toLocaleTimeString();
    console.log(`🕓 [${timestamp}] 🎨 Inspiro AI 開始生成圖片：${prompt}`);

    // === 1️⃣ 優先使用 OpenAI DALL·E ===
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      console.log("🟢 使用 OpenAI gpt-image-1 生成圖片中…");
      try {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt,
            size: "1024x1024",
          }),
        });

        const data = await response.json();
        if (data?.data?.[0]?.url) {
          console.log("✅ OpenAI 成功生成圖片");
          return res.json({
            source: "openai",
            image: data.data[0].url,
            download: data.data[0].url,
          });
        }
      } catch (err) {
        console.error("💥 OpenAI 生成錯誤：", err.message);
      }
    }

    // === 2️⃣ 改用 Gemini ===
    const GEMINI_IMAGE_KEY = process.env.GEMINI_API_KEY;
    const MODEL_IMAGE = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
    if (GEMINI_IMAGE_KEY) {
      console.log("🟡 使用 Gemini 生成圖片中…");
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_IMAGE}:generateContent?key=${GEMINI_IMAGE_KEY}`;
        const payload = {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `請生成一張圖片：「${prompt}」。請以 base64 編碼輸出，不要附文字。`,
                },
              ],
            },
          ],
        };

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        const base64Image =
          data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
          data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (base64Image) {
          const imageBuffer = Buffer.from(base64Image, "base64");
          const folderPath = path.join(process.cwd(), "generated");
          if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
          const fileName = `inspiro-${Date.now()}.png`;
          const filePath = path.join(folderPath, fileName);
          fs.writeFileSync(filePath, imageBuffer);

          const downloadUrl = `${req.protocol}://${req.get("host")}/generated/${fileName}`;
          console.log("✅ Gemini 成功生成圖片並已儲存：", fileName);

          return res.json({
            source: "gemini",
            image: `data:image/png;base64,${base64Image}`,
            download: downloadUrl,
          });
        }
      } catch (err) {
        console.error("💥 Gemini 錯誤：", err.message);
      }
    }

    // === 3️⃣ 最後使用 Hugging Face (免費方案) ===
    const HF_TOKEN = process.env.HF_TOKEN;
    if (HF_TOKEN) {
      console.log("🔵 使用 Hugging Face 生成圖片中…");
      try {
        const model = "stabilityai/stable-diffusion-xl-base-1.0";
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: prompt }),
        });

        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const base64Image = imageBuffer.toString("base64");

        const folderPath = path.join(process.cwd(), "generated");
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
        const fileName = `inspiro-${Date.now()}.png`;
        const filePath = path.join(folderPath, fileName);
        fs.writeFileSync(filePath, imageBuffer);

        const downloadUrl = `${req.protocol}://${req.get("host")}/generated/${fileName}`;
        console.log("✅ Hugging Face 成功生成圖片：", fileName);

        return res.json({
          source: "huggingface",
          image: `data:image/png;base64,${base64Image}`,
          download: downloadUrl,
        });
      } catch (err) {
        console.error("💥 Hugging Face 錯誤：", err.message);
      }
    }

    // === 全部失敗 ===
    console.error("❌ Inspiro AI 所有引擎皆失敗。");
    res.status(500).json({ error: "⚠️ Inspiro AI 無法生成圖片，請稍後再試。" });
  } catch (err) {
    console.error("💥 Inspiro AI 圖片生成系統錯誤：", err.message);
    res.status(500).json({ error: "⚠️ Inspiro AI 系統錯誤" });
  }
});

/* === 📁 提供圖片下載靜態資料夾 === */
app.use("/generated", express.static("generated"));

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
