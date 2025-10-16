# 💎 Inspiro AI Server v4.0

主力：Stability AI  
備援：Fal.ai  
架構：Node.js + Express + Railway

## 🚀 部署步驟
1. Fork 專案到 GitHub
2. 開啟 Railway → New Project → Deploy from GitHub
3. 在 Railway 的 **Variables** 區設定以下：
   - SESSION_SECRET
   - STABILITY_API_KEY
   - FAL_TOKEN
4. 部署完成後打開網址 → `/health` 測試是否運作

✅ 出現：
```json
{"status":"✅ Running"}
