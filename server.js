import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 這就是 AI 的路由（Squarespace 會呼叫這裡）
app.post("/api/generate", async (req, res) => {
  const { message } = req.body;

  try {
    // 🔹暫時先給假回覆測試連線
    const reply = `這是 Inspiro AI 回覆：「${message}」`;
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ reply: "伺服器錯誤" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
