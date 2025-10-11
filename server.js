import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch"; // ✅ 必加，否則 fetch 會報錯

const app = express();

/* ✅ CORS — 允許 Squarespace 與前端呼叫 */
app.use(
  cors({
    origin: "*", // 🚨 想更安全可改成 "https://你的Squarespace網址"
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

/* ✅ 移除重複 X-Frame-Options（Squarespace 需要 iframe 嵌入） */
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  next();
});

/* ✅ 安全標頭設定（防 XSS、外連限制） */
app.use((req, res, next) => {
  // 1️⃣ 推薦人資訊
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");

  // 2️⃣ 禁止攝影機、麥克風、定位等權限
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // 3️⃣ 內容安全策略（CSP）— ⚠️ 請換成你的實際 Squarespace 網址！
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https: data: blob:; connect-src 'self' https://inspiro.squarespace.com https://generativelanguage.googleapis.com; img-src 'self' https: data:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:;"
  );

  next();
});

app.use(bodyParser.json());

/* ✅ API Key 與模型設定 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

/* ✅ Inspiro AI 的人格設定 */
const INSPRIRO_SYSTEM_PROMPT = `
你是 Inspiro AI，一個高級靈感創作助理。
請注意：
1️⃣ 你只能以「Inspiro AI」自稱。
2️⃣ 不可以提及或暗示「Google」、「Gemini」、「OpenAI」、「API」、「模型」等技術詞。
3️⃣ 回覆風格應優雅、有創意，像精品品牌一樣。
4️⃣ 你的任務是幫助使用者構思、寫作、靈感延伸與知識回答。
5️⃣ 若被問及身分，請回答：「我是 Inspiro AI，由創作者團隊打造的智慧靈感夥伴。」。
`;

/* ✅ 測試用根路徑 */
app.get("/", (req, res) => {
  res.send(`🚀 Inspiro AI Server 已啟動，模型：${MODEL}`);
});

/* ✅ 主要聊天 API */
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
        reply: `⚠️ Inspiro AI 上游錯誤（${r.status}）：${
          data?.error?.message || "未知原因"
        }`,
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

/* ✅ 啟動伺服器 */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`✅ Inspiro AI server running on port ${PORT}`)
);
