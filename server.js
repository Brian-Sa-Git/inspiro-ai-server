import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/api/generate", async (req, res) => {
  const { message } = req.body;

  try {
    // 這裡用 Google Gemini / OpenAI / 其他 API 都可以
    // 假設你用 Gemini：
    const reply = `這是 Inspiro AI 回覆：「${message}」`; // 先用假回覆測試
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ reply: "伺服器錯誤" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
