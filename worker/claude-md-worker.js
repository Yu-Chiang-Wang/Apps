// ===== Cloudflare Worker: CLAUDE.md generator =====
// 部署:
//   1. cd worker
//   2. wrangler deploy
//   3. wrangler secret put GEMINI_API_KEY  (貼上你的 Google AI Studio API key)
//
// 環境變數:
//   GEMINI_API_KEY  (secret) — 從 https://aistudio.google.com/apikey 取得
//
// 模型:
//   預設使用 gemini-2.0-flash(免費 tier,延遲低、品質夠)
//   想換更強模型可改 MODEL 常數,但要注意免費額度。

const MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// 允許呼叫此 Worker 的來源(部署後請替換成你的 GitHub Pages URL 與自訂網域)
const ALLOWED_ORIGINS = [
  'https://yu-chiang.github.io',          // TODO: 改成你的 GitHub Pages URL
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'null',                                  // file:// 本機直開
];

// 簡單的長度限制,避免被亂送爆量請求
const MAX_FIELD_LEN = 2000;
const MAX_README_LEN = 8000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    // 健康檢查
    if (request.method === 'GET' && url.pathname === '/') {
      return jsonResponse({ ok: true, service: 'claude-md-generator' }, 200, cors);
    }

    if (request.method !== 'POST' || url.pathname !== '/generate') {
      return jsonResponse({ error: 'Not found' }, 404, cors);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: 'Server is missing GEMINI_API_KEY' }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: '送出的不是合法 JSON' }, 400, cors);
    }

    const data = sanitize(body);
    if (!data.projectName || !data.description) {
      return jsonResponse({ error: '請至少填寫 projectName 與 description' }, 400, cors);
    }

    const prompt = buildPrompt(data);

    try {
      const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            topP: 0.9,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error('Gemini error:', geminiRes.status, errText);
        return jsonResponse(
          { error: `AI 模型回傳錯誤 (${geminiRes.status})` },
          502,
          cors
        );
      }

      const result = await geminiRes.json();
      const markdown = extractText(result);
      if (!markdown) {
        return jsonResponse({ error: '模型沒有回傳內容,請再試一次' }, 502, cors);
      }

      return jsonResponse({ markdown: cleanMarkdown(markdown) }, 200, cors);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: '伺服器錯誤,請稍後再試' }, 500, cors);
    }
  },
};

// ===== Helpers =====

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function jsonResponse(payload, status, cors) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  });
}

function sanitize(input) {
  const pick = (k, max = MAX_FIELD_LEN) =>
    typeof input?.[k] === 'string' ? input[k].slice(0, max).trim() : '';
  return {
    projectName: pick('projectName', 200),
    description: pick('description', 400),
    languages: pick('languages'),
    frameworks: pick('frameworks'),
    commands: pick('commands'),
    conventions: pick('conventions'),
    aiNotes: pick('aiNotes'),
    donts: pick('donts'),
    readmeContent: pick('readmeContent', MAX_README_LEN),
  };
}

function buildPrompt(d) {
  const lines = [];
  lines.push(`專案名稱:${d.projectName}`);
  lines.push(`一句話描述:${d.description}`);
  if (d.languages) lines.push(`主要程式語言:${d.languages}`);
  if (d.frameworks) lines.push(`框架 / 主要工具:${d.frameworks}`);
  if (d.commands) lines.push(`常用指令:\n${d.commands}`);
  if (d.conventions) lines.push(`程式碼風格與慣例:\n${d.conventions}`);
  if (d.aiNotes) lines.push(`給 AI 助手的注意事項:\n${d.aiNotes}`);
  if (d.donts) lines.push(`不要做的事:\n${d.donts}`);
  if (d.readmeContent) {
    lines.push(`(以下是專案 README,可作為額外的脈絡參考)\n\`\`\`markdown\n${d.readmeContent}\n\`\`\``);
  }

  return `你是資深軟體工程師,協助使用者撰寫 Claude Code 的 CLAUDE.md 規範文件。

關於 CLAUDE.md:
CLAUDE.md 是放在專案根目錄的 markdown 檔。Claude Code 每次啟動時會自動把它載入 context,讓 AI 助手了解專案脈絡、慣例與限制。一份好的 CLAUDE.md 應該幫助 AI 從第一個請求就做出符合專案規矩的回應。

請涵蓋(視使用者提供的資訊有無、判斷哪些 section 該寫):
- 專案定位(一段話,讓 AI 知道這是什麼、為何存在)
- 技術堆疊
- 檔案結構 / 模組組織(若使用者沒提,可略過或從 README 推斷)
- 常用指令(build / dev / test / deploy)
- 程式碼風格、命名慣例
- 給 AI 助手的明確指示:該做、不該做
- 領域知識或重要的商業邏輯(若 README 有提到)

撰寫原則:
- 用繁體中文撰寫
- 工程師口吻,直接、不浮誇、不行銷話術
- 條列清楚,可掃讀;適度用 ## 與 ### 切分章節
- 不要寫 AI 已經能自行從程式碼推斷的內容
- 不要編造使用者沒提到的資訊;資訊不足的 section 就略過
- 直接輸出 CLAUDE.md 的 markdown 內容,不要包在 \`\`\`markdown 區塊裡,也不要加任何開場白、結尾說明、或「以下是...」之類的注解

使用者提供的專案資訊:

${lines.join('\n\n')}`;
}

function extractText(result) {
  const candidates = result?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => p?.text || '').join('').trim();
}

// 移除模型有時還是會包的 ```markdown ... ``` 外層
function cleanMarkdown(md) {
  let s = md.trim();
  const fence = s.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) s = fence[1].trim();
  return s;
}
