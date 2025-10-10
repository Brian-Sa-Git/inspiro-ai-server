import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/", (req, res) => {
  res.send("✅ Inspiro AI is running");
});

app.post("/api/generate", async (req, res) => {
  try {
    const { message, userId, membership } = req.body;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
    使用者類型: ${membership}
    使用者訊息: ${message}
    請以自然、優雅、創意的中文回覆，語氣要親切。
    `;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    res.json({ reply });
  } catch (error) {
    console.error("Gemini Error:", error);
    res.json({ error: "AI 伺服器錯誤，請稍後再試。" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
