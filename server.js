/* === 🎨 Inspiro AI 雙引擎圖片生成 API（OpenAI 優先 → Gemini 備援）=== */
app.post("/api/image", async (req, res) => {
  try {
    const { prompt } = req.body;

    // === 1️⃣ 輸入檢查 ===
    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({ error: "⚠️ 請提供清楚的圖片描述內容。" });
    }

    // === 2️⃣ 優先使用 OpenAI DALL·E 3 ===
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      console.log("🟢 使用 OpenAI gpt-image-1 生成圖片...");

      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-image-1", // DALL·E 3 模型
            prompt: prompt,
            size: "1024x1024",
          }),
        });

        const openaiData = await openaiResponse.json();

        // ✅ 成功回傳圖片
        if (openaiData?.data?.[0]?.url) {
          return res.json({
            source: "openai",
            image: openaiData.data[0].url,
          });
        }

        // ⚠️ 回傳異常情況（可能金鑰限額 / 伺服器錯誤）
        console.error("⚠️ OpenAI 回傳異常：", openaiData);

      } catch (err) {
        console.error("💥 OpenAI 生成失敗，將切換至 Gemini：", err);
      }
    }

    // === 3️⃣ 改用 Gemini（Google 免費引擎）===
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "⚠️ 尚未設定任何圖片 API 金鑰（GEMINI 或 OPENAI）。",
      });
    }

    console.log("🟡 使用 Gemini 生成圖片...");

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `請生成一張圖片：「${prompt}」。請輸出為 base64 編碼，不要文字說明。`,
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

    // ✅ 嘗試從 Gemini 取出圖片
    const base64Image =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!base64Image) {
      console.error("⚠️ Gemini 沒有回傳圖片內容：", JSON.stringify(geminiData, null, 2));
      return res.status(500).json({ error: "⚠️ Gemini 沒有回傳圖片內容。" });
    }

    // ✅ 統一格式：data:image/png;base64
    return res.json({
      source: "gemini",
      image: `data:image/png;base64,${base64Image}`,
    });

  } catch (err) {
    console.error("💥 Inspiro AI 圖片生成錯誤：", err);
    res.status(500).json({ error: "⚠️ Inspiro AI 圖片生成失敗" });
  }
});
