import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express(); // ✅ 一定要先宣告 app
app.use(cors());
app.use(bodyParser.json());

/* === 🎨 Inspiro AI 雙引擎圖片生成 API（OpenAI + Gemini 自動切換）=== */
app.post("/api/image", async (req, res) => {
  try {
    const { prompt } = req.body;

    // === 1️⃣ 檢查使用者輸入 ===
    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({ error: "⚠️ 請提供清楚的圖片描述內容。" });
    }

    // === 2️⃣ 嘗試使用 OpenAI (DALL·E 3) ===
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      console.log("🟢 使用 OpenAI gpt-image-1 生成圖片");

      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: prompt,
            size: "1024x1024",
          }),
        });

        const openaiData = await openaiResponse.json();

        if (openaiData?.data?.[0]?.url) {
          return res.json({
            source: "openai",
            image: openaiData.data[0].url,
          });
        } else {
          console.error("⚠️ OpenAI 回傳異常：", openaiData);
        }
      } catch (err) {
        console.error("💥 OpenAI 生成失敗，切換到 Gemini：", err);
      }
    }

    // === 3️⃣ 如果沒有 OpenAI 或失敗 → 使用 Gemini ===
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "⚠️ 尚未設定任何圖片 API 金鑰（GEMINI 或 OPENAI）。",
      });
    }

    console.log("🟡 使用 Gemini 生成圖片");

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `請生成一張圖片：「${prompt}」。請以 base64 編碼輸出，不要附任何文字說明。`,
            },
          ],
        },
      ],
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const geminiData = await geminiResponse.json();
    const base64Image =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!base64Image) {
      console.error("⚠️ Gemini 沒有回傳圖片內容：", JSON.stringify(geminiData, null, 2));
      return res.status(500).json({ error: "⚠️ Gemini 沒有回傳圖片內容。" });
    }

    return res.json({
      source: "gemini",
      image: `data:image/png;base64,${base64Image}`,
    });
  } catch (err) {
    console.error("💥 Inspiro AI 圖片生成錯誤：", err);
    res.status(500).json({ error: "⚠️ Inspiro AI 圖片生成失敗" });
  }
});

/* === 🚀 啟動伺服器 === */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Inspiro AI Server running on port ${PORT}`);
});
