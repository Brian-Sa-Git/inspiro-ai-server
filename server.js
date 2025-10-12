/* === 🧩 模組匯入 === */
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import session from "express-session";
import MemoryStore from "memorystore";
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

/* === 🧠 Session 設定（使用 MemoryStore 改良版）=== */
const Memorystore = MemoryStore(session);
app.use(
  session({
    cookie: { maxAge: 86400000 }, // 1 天
    store: new Memorystore({ checkPeriod: 86400000 }),
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
    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "🤖 Inspiro AI 暫時沒有回覆內容。";

    res.json({ reply: aiText });
  } catch (err) {
    console.error("💥 Inspiro AI 對話錯誤：", err);
    res.status(500).json({ reply: "⚠️ Inspiro AI 發生暫時錯誤。" });
  }
});

/* === 🎨 Inspiro AI 圖片生成 API（Gemini + Hugging Face）=== */
app.post("/api/image", async (req, res) => {
  try {
    let { prompt } = req.body;

    // 🧩 防呆：若未輸入主題，自動補預設
    if (!prompt || prompt.trim().length < 2) {
      console.warn("⚠️ 未提供 prompt，自動使用預設主題。");
      prompt = "AI 藝術風格圖，主題為流動的光與創意靈感，精品風格";
    }

    // 💎 自動加上精品風格描述
    const styledPrompt = `
主題：${prompt}
請生成一張畫質高、黑金精品風格、明亮科技感、立體光影、乾淨背景的圖片。
`;

    console.log(`🎨 開始生成圖片：「${prompt}」`);
    console.log("⏩ 使用 Gemini / Hugging Face 引擎。");

    /* === 1️⃣ Gemini 生成圖片 === */
    const GEMINI_IMAGE_KEY = process.env.GEMINI_API_KEY;
    const MODEL_IMAGE = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

    if (GEMINI_IMAGE_KEY) {
      console.log("🟡 使用 Gemini 生成圖片...");
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_IMAGE}:generateContent?key=${GEMINI_IMAGE_KEY}`;
        const payload = {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `請生成一張圖片：「${styledPrompt}」。請以 base64 編碼輸出，不要附任何文字說明。`,
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
        let base64Image =
          data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
          data?.candidates?.[0]?.content?.parts?.[0]?.text;

        base64Image = base64Image?.replace(/[\r\n\s]/g, "");

        if (base64Image && /^[A-Za-z0-9+/]+={0,2}$/.test(base64Image)) {
          const imageBuffer = Buffer.from(base64Image, "base64");
          const folderPath = path.join(process.cwd(), "generated");
          if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);

          const fileName = `inspiro-${Date.now()}.png`;
          const filePath = path.join(folderPath, fileName);
          fs.writeFileSync(filePath, imageBuffer);

          const downloadUrl = `${req.protocol}://${req.get("host")}/generated/${fileName}`;
          console.log("✅ Gemini 成功生成圖片並儲存：", fileName);

          return res.json({
            source: "gemini",
            image: `data:image/png;base64,${base64Image}`,
            download: downloadUrl,
          });
        } else {
          console.warn("⚠️ Gemini 回傳非圖片內容");
        }
      } catch (err) {
        console.error("💥 Gemini 圖片生成錯誤：", err.message);
      }
    }

    /* === 2️⃣ Hugging Face 備援生成 === */
    const HF_TOKEN = process.env.HF_TOKEN;
    if (HF_TOKEN) {
      console.log("🔵 使用 Hugging Face 生成圖片...");
      try {
        const model = "stabilityai/stable-diffusion-xl-base-1.0";
        const response = await fetch(
          `https://api-inference.huggingface.co/models/${model}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${HF_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ inputs: styledPrompt }),
          }
        );

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

    /* === 全部失敗 === */
    console.error("❌ Inspiro AI 所有引擎皆失敗。");
    res.status(500).json({ error: "⚠️ Inspiro AI 無法生成圖片，請稍後再試。" });
  } catch (err) {
    console.error("💥 Inspiro AI 圖片生成系統錯誤：", err.message);
    res.status(500).json({ error: "⚠️ Inspiro AI 系統錯誤" });
  }
});

/* === 📁 靜態資料夾：提供圖片下載（支援跨來源 + MIME 修正）=== */
app.use("/generated", (req, res) => {
  try {
    const filePath = path.join(process.cwd(), "generated", decodeURIComponent(req.path));
    if (!fs.existsSync(filePath)) return res.status(404).send("❌ 圖片不存在");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "image/png");

    res.sendFile(filePath);
  } catch (err) {
    console.error("⚠️ 圖片回傳錯誤：", err);
    res.status(500).send("⚠️ Inspiro AI 圖片提供發生錯誤");
  }
});

/* === 🧹 自動清理舊圖片（每 3 小時清理超過 3 小時的檔案）=== */
setInterval(() => {
  const folderPath = path.join(process.cwd(), "generated");
  const THREE_HOURS = 3 * 60 * 60 * 1000;

  if (!fs.existsSync(folderPath)) return;

  const files = fs.readdirSync(folderPath);
  const now = Date.now();

  files.forEach((file) => {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > THREE_HOURS) {
      fs.unlinkSync(filePath);
      console.log(`🧹 自動清理：刪除舊檔案 ${file}`);
    }
  });
}, 3 * 60 * 60 * 1000);

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI Server running on port ${PORT}`);
  console.log("🌍 狀態檢查：AI 模型 =", MODEL);
});

/* === 💤 防止 Railway 自動休眠 === */
setInterval(async () => {
  try {
    await fetch("https://inspiro-ai-server-production.up.railway.app/");
    console.log("💤 Inspiro AI still alive at", new Date().toLocaleTimeString());
  } catch {
    console.warn("⚠️ Railway ping 失敗（可能暫時離線）");
  }
}, 60 * 1000);
