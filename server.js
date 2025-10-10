import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- 測試用首頁 ---
app.get("/", (req, res) => {
  res.send("🚀 Inspiro AI server is running with Gemini!");
});

// --- Gemini 聊天 API ---
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message }] }]
        }),
      }
    );

    const data = await response.json();
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ 無法取得 Gemini 回覆";

    res.json({ reply: aiText });

  } catch (error) {
    console.error("Gemini API 錯誤：", error);
    res.status(500).json({ reply: "❌ 伺服器發生錯誤，請稍後再試。" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
