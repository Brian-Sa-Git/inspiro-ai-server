import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 🌟 可自訂模型（gemini-1.5-flash / gemini-1.5-pro / gemini-2.0-flash-exp）
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp"; 

// --- 測試 API ---
app.get("/", (req, res) => {
  res.send(`🚀 Inspiro AI 伺服器已啟動。使用模型：${MODEL}`);
});

// --- 聊天 API ---
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 金鑰未設定，請稍後再試。",
      });
    }

    // 🔥 自動偵測正確 API 版本（2.0 系列需用 v1beta）
    const isV2 = MODEL.startsWith("gemini-2");
    const apiVersion = isV2 ? "v1beta" : "v1beta"; // 目前 1.5 / 2.0 都使用 v1beta

    const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: message }],
        },
      ],
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("❌ Inspiro AI 上游錯誤：", r.status, data);
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 發生暫時錯誤，請稍後再試。",
      });
    }

    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "🤖 Inspiro AI 暫時沒有回覆內容。";

    return res.json({ reply: aiText });
  } catch (err) {
    console.error("💥 Inspiro AI 伺服器錯誤：", err);
    return res.status(500).json({
      reply: "⚠️ Inspiro AI 發生暫時錯誤，請稍後再試。",
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Inspiro AI server running on port ${PORT}`));
