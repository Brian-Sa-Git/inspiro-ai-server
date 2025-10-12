/* === 🎨 Gemini 圖片生成 API (免費版, 使用 gemini-2.0-flash-exp) === */
app.post("/api/image", async (req, res) => {
  try {
    const { prompt } = req.body;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp"; // ✅ 改這裡！

    if (!GEMINI_API_KEY) {
      console.error("❌ 缺少 GEMINI_API_KEY");
      return res.status(500).json({
        error: "⚠️ 尚未設定 GEMINI_API_KEY，請到 Railway Variables 新增。",
      });
    }

    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({ error: "⚠️ 請提供清楚的圖片描述內容。" });
    }

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

    // ✅ Gemini 回傳的圖片格式通常在 inline_data 裡
    const base64Image =
      data?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!base64Image) {
      console.error("⚠️ Gemini 沒有回傳圖片內容：", JSON.stringify(data, null, 2));
      return res.status(500).json({ error: "⚠️ Gemini 沒有回傳圖片內容。" });
    }

    // ✅ 統一輸出成 data:image/png;base64 格式
    res.json({ image: `data:image/png;base64,${base64Image}` });
  } catch (err) {
    console.error("💥 Gemini 圖片生成錯誤：", err);
    res.status(500).json({ error: "⚠️ Gemini 圖片生成失敗" });
  }
});
