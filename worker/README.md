# Cloudflare Worker — CLAUDE.md 產生器後端

前端 `tools/claude-md/` 會 POST 到這個 Worker,由它代為呼叫 Gemini API。
這樣 API Key 留在伺服器端,不會暴露在 GitHub Pages 的 JS 裡。

---

## 一次性設定(5 分鐘)

```bash
# 1. 安裝 wrangler(全域或專案內二擇一)
npm install -g wrangler

# 2. 登入 Cloudflare(會開瀏覽器)
wrangler login

# 3. 拿 Gemini API Key
#    https://aistudio.google.com/apikey  → Create API key
#    免費額度(2025 年):gemini-2.0-flash 約 15 RPM / 1500 RPD

# 4. 進到本資料夾後,把 Key 設為 secret(不會進 git)
cd worker
wrangler secret put GEMINI_API_KEY
# 貼上剛剛的 key,Enter

# 5. 部署
wrangler deploy
```

部署成功後,wrangler 會印出 Worker URL,例如:
```
https://claude-md.<your-subdomain>.workers.dev
```

---

## 串到前端

打開 `tools/claude-md/app.js`,把最上面的 `API_ENDPOINT` 改成你的 Worker URL:

```js
const API_ENDPOINT = 'https://claude-md.<your-subdomain>.workers.dev';
```

同時打開 `worker/claude-md-worker.js`,把 `ALLOWED_ORIGINS` 第一個項目改成你的 GitHub Pages URL:

```js
const ALLOWED_ORIGINS = [
  'https://<your-github-username>.github.io',  // ← 改這個
  ...
];
```

改完再 `wrangler deploy` 一次。

---

## 本機開發

```bash
cd worker
wrangler dev
# 預設 http://127.0.0.1:8787
```

前端如果想打本機 Worker,暫時把 `app.js` 的 `API_ENDPOINT` 改成 `http://127.0.0.1:8787`,
然後用任意 static server 跑前端(例如 `python3 -m http.server 8000`,在專案根目錄)。

---

## 看 log / 除錯

```bash
wrangler tail
```

Gemini 回 4xx/5xx 時,Worker 會 `console.error`,在 `tail` 裡能看到實際錯誤。

---

## 之後要加付費 / 限流

目前 Worker 沒做 rate limit,任何打到 `ALLOWED_ORIGINS` 的請求都會直接呼叫 Gemini。
擴充方向(由淺到深):

1. **每 IP 限流** — 用 Cloudflare KV 紀錄 `requests:<ip>`,超過閾值回 429
2. **Cloudflare Turnstile** — 前端塞一個免費 captcha,避免機器人
3. **付費驗證** — 串 Stripe / Lemon Squeezy,登入後給 token,Worker 驗 token 才放行

---

## 安全提醒

- `GEMINI_API_KEY` 一定要用 `wrangler secret put` 設,**不要**寫進 `wrangler.toml` 或 commit 進 git
- `ALLOWED_ORIGINS` 不要設 `*`,否則任何網站都能呼叫你的 Worker、刷光額度
- 若 Key 不慎外流,到 Google AI Studio 立刻把它 revoke 並產一把新的
