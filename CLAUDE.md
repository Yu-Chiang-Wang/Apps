# Yu-Chiang Apps

親手打造的 AI 小工具集 — 串接 AI API 解決真實工作場景的小工具庫。
維護者:Yu-Chiang Wang (jonathanwang1103@gmail.com)
部署:GitHub Pages → https://yu-chiang-wang.github.io/Apps/

---

## 專案定位

不是導覽他人 SaaS 的目錄站,而是 **個人作品集 + 工具入口**:
- 每個工具都聚焦解決一件具體的事
- 主軸是 Prompt 工程與 AI API 串接
- 現有工具:會計表格產生器、CLAUDE.md 產生器

## 文案語氣

- 工程師口吻,直接、不浮誇
- 主標短而有力,可帶點口語(現行:「讓 AI 處理那些重複又煩人的工作」)
- 副標說明做了什麼、解決什麼,避免行銷套話
- emoji 點到為止,別當主視覺

---

## 視覺品牌

### Color Palette

色票基底:[Coolors palette](https://coolors.co/palette/e63946-f1faee-a8dadc-457b9d-1d3557)

| Token | Hex | 用途 |
|---|---|---|
| `--c-red`       | `#e63946` | 主強調:CTA、連結、hover 強調 |
| `--c-bg`        | `#f5f5f5` | 頁面背景 |
| `--c-sky`       | `#a8dadc` | 輔助點綴:卡片 hover 邊框 |
| `--c-blue`      | `#457b9d` | 次強調:分類文字、focus ring |
| `--c-navy`      | `#1d3557` | 主文字、Logo 底色、active 按鈕 |
| `--c-card`      | `#ffffff` | 卡片背景 |
| `--c-border`    | `#e5e5e5` | 邊框 |
| `--c-text-soft` | `#4a5e74` | 次要文字 |
| `--c-soft-tint` | `#f0f0f0` | tool-icon / tool-tag 背景 |

### Typography

```
-apple-system, BlinkMacSystemFont, "Segoe UI",
"PingFang TC", "Noto Sans TC", "Microsoft JhengHei",
sans-serif
```

- 主標 (h1):`clamp(34px, 5.5vw, 56px)`,字重 700,letter-spacing `-0.02em`
- 卡片標題:17px,字重 700
- 內文:14–18px,字重 400
- 行高:body 1.65,h1 1.15

### Logo

- 字母「Y」放在深藍 `#1d3557` 圓角方塊上,文字色為 `#f5f5f5`
- favicon 為同設計的 inline SVG(寫在 `<head>`)

---

## 元件規範

### Tool Card

每張卡片代表一個工具,結構:
```html
<article class="tool-card" data-category="..." data-keywords="空白分隔關鍵字">
  <span class="badge badge-soon">籌備中</span>     <!-- 或 badge-new -->
  <div class="tool-header">
    <div class="tool-icon">📊</div>                <!-- emoji 或 SVG -->
    <div>
      <h3 class="tool-name">工具名稱</h3>
      <p class="tool-category">分類顯示名</p>
    </div>
  </div>
  <p class="tool-desc">一句話描述工具解決什麼。</p>
  <div class="tool-tags">
    <span class="tool-tag">標籤</span>
  </div>
  <a class="tool-link" href="...">前往工具</a>     <!-- 未上線時加 disabled class -->
</article>
```

**Category 對應**(寫在 `data-category`):
- `document` — 文件產生
- `prompt` — Prompt 工程
- `data` — 表格與資料
- `dev` — 開發者工具
- `music` — 音樂創作

**新增工具步驟**:複製現有 `<article>` → 改 5 個欄位(category / keywords / icon / 文字 / 連結)→ 籌備中保留 `badge-soon` + `tool-link disabled`,完成後改 `badge-new` + 真實 href。

---

## 檔案結構

```
Yu-Chiang_apps/
├── index.html                        # 首頁(工具卡片清單)
├── styles.css                        # 首頁樣式
├── CLAUDE.md
├── .github/workflows/deploy.yml      # GitHub Pages 自動部署
├── tools/
│   ├── accounting-table/             # 會計表格產生器
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js                    # 呼叫 accounting-table Worker
│   ├── claude-md/                    # CLAUDE.md 產生器
│   └── chord-generator/              # 隨機和弦生成器(純前端,無 Worker)
│       ├── index.html
│       ├── styles.css
│       └── app.js                    # 呼叫 claude-md Worker
└── worker/                           # Cloudflare Workers(API proxy)
    ├── accounting-table-worker.js    # Gemini API proxy
    ├── claude-md-worker.js           # Claude API proxy
    ├── wrangler-accounting.toml
    └── wrangler.toml
```

**單一首頁原則**:工具卡片直接寫在 `index.html` 的 `#grid` 內,不靠 JS 動態載入(SEO 考量)。

**工具子頁結構**:每個工具獨立目錄,包含 `index.html + styles.css + app.js`。app.js 負責 UI 互動與呼叫對應 Worker。

---

## Worker 架構

前端不直接持有 API key,所有 AI API 呼叫透過 **Cloudflare Workers** 作為 proxy:

| Worker | wrangler config | 後端 API |
|---|---|---|
| `accounting-table` | `wrangler-accounting.toml` | Google Gemini |
| `claude-md` | `wrangler.toml` | Anthropic Claude |

Worker 透過 `env.GEMINI_API_KEY` / `env.ANTHROPIC_API_KEY` 讀取 Secret(用 `wrangler secret put` 設定)。
CORS 只允許 `https://yu-chiang-wang.github.io` 及 localhost。

部署 Worker:
```bash
cd worker
wrangler deploy --config wrangler-accounting.toml   # 會計表格
wrangler deploy --config wrangler.toml              # CLAUDE.md
```

---

## SEO 規範

每次改 `index.html` 都要同步:
- `<title>`、`<meta name="description">`、Open Graph 三組 title/description/url
- `canonical` 與 `og:url` 固定為 `https://yu-chiang-wang.github.io/Apps/`
- 中文文案保持 `lang="zh-Hant"` + `og:locale="zh_TW"`
- 新增工具若有獨立子頁,可考慮在 JSON-LD 中加入 `ItemList`

---

## 部署

GitHub Pages 從 main branch root 自動部署(push 即觸發)。
- `og-image.png` 尚未製作,需要主視覺後再補
- Worker 需另外用 wrangler 手動部署(見上方 Worker 架構)
- 若使用自訂網域,在 root 放 `CNAME` 並更新 canonical / og:url
