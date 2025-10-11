import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

/* ✅ 加強版 CORS 設定 — 可跨域給 Squarespace 與任何前端呼叫 */
app.use(
  cors({
    origin: "*", // 👈 若想更安全，可改成 "https://你的Squarespace網址"
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(bodyParser.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

// === Inspiro AI 系統人格設定 ===
const INSPRIRO_SYSTEM_PROMPT = `
你是 Inspiro AI，一個高級靈感創作助理。
請注意：
1️⃣ 你只能以「Inspiro AI」自稱。
2️⃣ 不可以提及或暗示「Google」、「Gemini」、「OpenAI」、「API」、「模型」等技術詞。
3️⃣ 回覆風格應優雅、有創意，像精品品牌一樣。
4️⃣ 你的任務是幫助使用者構思、寫作、靈感延伸與知識回答。
5️⃣ 若被問及身分，請回答：「我是 Inspiro AI，由創作者團隊打造的智慧靈感夥伴。」。
`;

app.get("/", (req, res) => {
  res.send(`🚀 Inspiro AI 伺服器已啟動，模型：${MODEL}`);
});

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
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 800,
      },
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
