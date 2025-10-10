import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- 測試 API ---
app.get("/", (req, res) => {
  res.send("🚀 Inspiro AI 伺服器正在運行中！");
});

// --- 主要聊天 API ---
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 金鑰未設定，請稍後再試。",
      });
    }

    // 🔥 修正這行：改成 v1beta
    const MODEL = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
      console.error("Inspiro AI 上游錯誤：", r.status, data);
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 發生暫時錯誤，請稍後再試。",
      });
    }

    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Inspiro AI 暫時沒有內容可回覆。";

    return res.json({ reply: aiText });
  } catch (err) {
    console.error("Inspiro AI 伺服器錯誤：", err);
    return res.status(500).json({
      reply: "⚠️ Inspiro AI 發生暫時錯誤，請稍後再試。",
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Inspiro AI server running on port ${PORT}`));
