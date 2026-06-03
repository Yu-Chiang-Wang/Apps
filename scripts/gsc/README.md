# GSC scripts

Google Search Console 自動化腳本,供 Claude / 本人從 CLI 直接撈資料,不用每次開 GSC 網頁。

## 一次性設定

1. OAuth client 已放在 `~/.config/gcloud/gsc-oauth-client.json`(chmod 600)
2. 第一次跑授權:
   ```bash
   cd scripts/gsc
   npm install
   npm run auth
   ```
   瀏覽器會跳出 Google 登入頁 → 選你的帳號 → 看到「Google hasn't verified this app」按 **Advanced → Go to (app name)** → Allow → 自動跳回「授權成功」頁面。
3. 確認可讀:
   ```bash
   npm run sites
   ```

完成後 token 存在 `~/.config/gcloud/gsc-token.json`,腳本自動使用。

## 常用指令

```bash
# 預設(最近 28 天的 top 20 query)
npm run report

# 變化區間 / 維度 / 列數 / 過濾
node report.js --days=7
node report.js --dim=page
node report.js --dim=country --rows=10
node report.js --filter=claude
node report.js --site=https://yu-chiang-wang.github.io/Apps/
```

`--dim` 可用:`query` (預設) · `page` · `country` · `device` · `date`

## 檔案位置

| 用途 | 路徑 |
|---|---|
| OAuth client 機密 | `~/.config/gcloud/gsc-oauth-client.json` |
| Refresh token | `~/.config/gcloud/gsc-token.json` |
| 預設 site / 設定 | `~/.config/gcloud/gsc-config.json` |

都在專案外,不會被 commit。
