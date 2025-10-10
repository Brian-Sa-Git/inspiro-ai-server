import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ 測試路由：Squarespace 會呼叫這裡
app.post("/api/generate", async (req, res) => {
  const { message } = req.body;
  console.log("收到使用者訊息：", message);

  try {
    // 暫時假回覆（確保前後端連線正常）
    const reply = `✨ Inspiro AI 收到你的訊息：「${message}」`;
    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "伺服器錯誤" });
  }
});

// Railway 預設 PORT 為環境變數
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
