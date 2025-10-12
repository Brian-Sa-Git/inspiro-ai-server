/* === 🎨 Inspiro AI 三引擎圖片生成 API（OpenAI + Gemini + Hugging Face）=== */
app.post("/api/image", async (req, res) => {
  try {
    const { prompt } = req.body;

    // === 1️⃣ 驗證使用者輸入 ===
    if (!prompt || prompt.trim().length < 2) {
      return res.status(400).json({ error: "⚠️ 請提供清楚的圖片描述內容。" });
    }

    // === 2️⃣ 優先使用 OpenAI DALL·E 3 ===
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

    // === 3️⃣ 沒有 OpenAI → 改用 Gemini ===
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
    if (GEMINI_API_KEY) {
      console.log("🟡 使用 Gemini 生成圖片");

      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `請生成一張圖片：「${prompt}」。請以 base64 編碼輸出，不要附任何文字或說明。`,
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

        if (base64Image) {
          return res.json({
            source: "gemini",
            image: `data:image/png;base64,${base64Image}`,
          });
        } else {
          console.error("⚠️ Gemini 沒有回傳圖片內容：", data);
        }
      } catch (err) {
        console.error("💥 Gemini 生成失敗，切換 Hugging Face：", err);
      }
    }

    // === 4️⃣ 最後使用 Hugging Face（免費） ===
    const HF_TOKEN = process.env.HF_TOKEN;
    if (HF_TOKEN) {
      console.log("🔵 使用 Hugging Face Stable Diffusion 生成圖片");

      const model = "stabilityai/stable-diffusion-xl-base-1.0"; // 免費模型
      try {
        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: prompt }),
        });

        if (!response.ok) {
          console.error("⚠️ Hugging Face 回應錯誤：", await response.text());
          throw new Error("Hugging Face API 錯誤");
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");

        return res.json({
          source: "huggingface",
          image: `data:image/png;base64,${base64Image}`,
        });
      } catch (err) {
        console.error("💥 Hugging Face 生成錯誤：", err);
      }
    }

    // === 三者皆失敗 ===
    return res.status(500).json({
      error: "⚠️ Inspiro AI 無法生成圖片，請稍後再試。",
    });
  } catch (err) {
    console.error("💥 Inspiro AI 圖片生成系統錯誤：", err);
    res.status(500).json({ error: "⚠️ Inspiro AI 系統錯誤" });
  }
});
