import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- 測試首頁 ---
app.get("/", (req, res) => {
  res.send("🚀 Inspiro AI 伺服器正在運行中！");
});

// --- 主要對話 API ---
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;

    // === 檢查金鑰 ===
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 伺服器未設定金鑰，請稍後再試。",
      });
    }

    // === 呼叫 Gemini API（但回覆內容不提 Gemini） ===
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message }] }],
        }),
      }
    );

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      throw new Error("AI 沒有回覆任何內容");
    }

    const aiText =
      data.candidates[0].content.parts[0].text ||
      "Inspiro AI 無法生成回覆，請再試一次。";

    res.json({ reply: aiText });
  } catch (err) {
    console.error("Inspiro AI 伺服器錯誤：", err);
    res.status(500).json({
      reply: "⚠️ Inspiro AI 發生暫時錯誤，請稍後再試。",
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Inspiro AI server running on port ${PORT}`));
