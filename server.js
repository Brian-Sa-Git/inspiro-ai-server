import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();

/* === 允許 Squarespace 前端跨域呼叫 === */
app.use(
  cors({
    origin: "*", // 💡 可改成你的 Squarespace 網址，例如 "https://amphibian-hyperboloid-z7dj.squarespace.com"
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

/* === 避免重複 X-Frame-Options === */
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  next();
});

/* === 安全性標頭補強 === */
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' https: data: blob:; connect-src 'self' https://amphibian-hyperboloid-z7dj.squarespace.com https://generativelanguage.googleapis.com; img-src 'self' https: data:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:;"
  );
  next();
});

app.use(bodyParser.json());

/* === API 金鑰與模型設定 === */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"; // ✅ 可改 gemini-2.0-flash-exp

/* === Inspiro AI 系統人格設定 === */
const INSPRIRO_SYSTEM_PROMPT = `
你是 Inspiro AI，一個高級靈感創作助理。
請注意：
1️⃣ 你只能以「Inspiro AI」自稱。
2️⃣ 不可以提及或暗示「Google」、「Gemini」、「OpenAI」、「API」、「模型」等技術詞。
3️⃣ 回覆風格應優雅、有創意，像精品品牌一樣。
4️⃣ 你的任務是幫助使用者構思、寫作、靈感延伸與知識回答。
5️⃣ 若被問及身分，請回答：「我是 Inspiro AI，由創作者團隊打造的智慧靈感夥伴。」。
`;

/* === 根路徑測試 === */
app.get("/", (req, res) => {
  res.send(`🚀 Inspiro AI 伺服器已啟動，模型：${MODEL}`);
});

/* === 自動重試功能（最多 3 次） === */
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // ⏳ 10 秒逾時
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return res;
      console.warn(`⚠️ 第 ${i + 1} 次嘗試失敗 (${res.status})`);
    } catch (err) {
      console.warn(`⚠️ 第 ${i + 1} 次連線失敗：${err.message}`);
      if (i === retries - 1) throw err; // 超過重試次數後拋出
    }
  }
}

/* === 主要聊天 API === */
app.post("/api/generate", async (req, res) => {
  try {
    const { message } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        reply: "⚠️ Inspiro AI 金鑰未設定，請稍後再試。",
      });
    }

    const apiVersion = "v1";
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

    // ✅ 使用自動重試版本
    const r = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r) {
      throw new Error("AI 服務連線失敗。");
    }

    const data = await r.json();

    if (!r.ok) {
      console.error("❌ Inspiro AI 上游錯誤：", r.status, data);
      return res.status(500).json({
        reply: `⚠️ Inspiro AI 上游錯誤 (${r.status})：${data.error?.message || "未知錯誤"}`,
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

/* === 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`✅ Inspiro AI server running on port ${PORT}`)
);
