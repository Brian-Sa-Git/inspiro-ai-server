/* === 🎨 Inspiro AI 雙引擎圖片生成 API（Gemini + OpenAI 自動切換）=== */
app.post("/api/image", async (req, res) => {
  try {
    const { prompt } = req.body;

    // === 檢查提示內容 ===
    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({ error: "⚠️ 請提供清楚的圖片描述內容。" });
    }

    // === 優先使用 OpenAI（如果有設定）===
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      console.log("🟢 使用 OpenAI gpt-image-1 生成圖片");

      try {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
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

        const data = await response.json();

        if (data?.data?.[0]?.url) {
          return res.json({
            source: "openai",
            image: data.data[0].url,
          });
        } else {
          console.error("⚠️ OpenAI 回傳異常：", data);
        }
      } catch (err) {
        console.error("💥 OpenAI 生成失敗，切換到 Gemini：", err);
      }
    }

    // === 若沒 OpenAI 金鑰，或失敗 → 改用 Gemini ===
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "⚠️ 尚未設定任何圖片 API 金鑰（GEMINI 或 OPENAI）。",
      });
    }

    console.log("🟡 使用 Gemini 生成圖片");

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `請生成一張圖片：「${prompt}」。請以 base64 輸出，不要附文字或說明。`,
            },
          ],
        },
      ],
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const base64Image =
      data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!base64Image) {
      console.error("⚠️ Gemini 沒有回傳圖片內容：", data);
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
