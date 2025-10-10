import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 讀取 API Key（一定要在 Railway 變數裡設定）
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 測試首頁
app.get("/", (req, res) => {
  res.send("🚀 Inspiro AI 伺服器正在運行中！");
});

// 主要對話 API
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 伺服器未設定金鑰，請稍後再試。",
      });
    }

    const MODEL = "gemini-1.5-flash"; // 你帳號可用的模型
    const url = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: message }],
        },
      ],
    };

    // Node 18 以上已有內建 fetch，這樣最乾淨，不需要 node-fetch
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await r.json();

    // 讓錯誤易於判讀（只記錄在後端 logs，不顯示給使用者）
    if (!r.ok) {
      console.error("Inspiro AI 上游錯誤：", r.status, data);
      const msg = data?.error?.message || "AI 服務回應異常";
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 發生暫時錯誤，請稍後再試。",
        // 若想暫時在前端看到細節方便除錯，可以加上：
        // debug: msg
      });
    }

    const aiText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Inspiro AI 暫時沒有內容可以回覆。";

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
