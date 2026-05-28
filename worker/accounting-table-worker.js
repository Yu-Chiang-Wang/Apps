// ===== Cloudflare Worker: 會計表格產生器 =====
// 部署:
//   1. cd worker
//   2. wrangler deploy --config wrangler-accounting.toml
//   3. wrangler secret put GEMINI_API_KEY --config wrangler-accounting.toml
//
// 環境變數:
//   GEMINI_API_KEY (secret) — 從 https://aistudio.google.com/apikey 取得

const MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const ALLOWED_ORIGINS = [
  'https://yu-chiang-wang.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'null',
];

// ===== 角色扮演 System Prompt =====
// 這裡可以自由修改角色設定；buildPrompt 只負責帶入使用者關鍵字。
const SYSTEM_ROLE = `\
你是一位擁有 15 年以上實務經驗的台灣專業會計師（CPA），精通 IFRS 國際財務報導準則與台灣 GAAP。
你曾服務上市公司、中小企業與新創，擅長依照不同產業客製化財務報表的科目結構與分類方式。

你的工作守則：
1. 嚴格依照客戶提供的「產業類型」與「特殊需求」關鍵字調整科目名稱與架構。
2. 輸出必須是可直接匯入 Excel 的完整 JSON 結構，不附加任何說明文字。
3. 科目命名符合台灣商業慣例，中文清楚易懂。
4. 若客戶關鍵字與標準科目衝突，優先遵從客戶關鍵字。`;

const VALID_INSTRUCTIONS = [
  '現金流量表使用間接法',
  '詳細展開費用子科目',
  '列出關聯方往來科目',
  '加入備注欄位提示',
];

const VALID_RESTRICTIONS = [
  '不要加虛構數字',
  '不要縮減科目',
  '不要產生說明文字',
  '不要翻譯成英文',
];

const TABLE_TYPE_NAMES = {
  income_statement: '損益表',
  balance_sheet: '資產負債表',
  cash_flow: '現金流量表',
  monthly_expense: '月費用分類帳',
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return jsonResponse({ ok: true, service: 'accounting-table-generator' }, 200, cors);
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
    if (!data.companyName) {
      return jsonResponse({ error: '請填寫公司名稱' }, 400, cors);
    }
    if (!data.tableTypes || data.tableTypes.length === 0) {
      return jsonResponse({ error: '請至少選擇一種報表類型' }, 400, cors);
    }

    const prompt = buildPrompt(data);

    try {
      const geminiPayload = JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_ROLE }],
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          topP: 0.9,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      });

      let geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiPayload,
      });

      // Retry once on 429 (rate limit) after a short delay
      if (geminiRes.status === 429) {
        await new Promise(r => setTimeout(r, 3000));
        geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: geminiPayload,
        });
      }

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error('Gemini error:', geminiRes.status, errText);
        if (geminiRes.status === 429) {
          return jsonResponse(
            { error: 'AI 模型請求次數超過限制，請稍等 1 分鐘後再試。' },
            429, cors
          );
        }
        return jsonResponse({ error: `AI 模型回傳錯誤 (${geminiRes.status})` }, 502, cors);
      }

      const result = await geminiRes.json();
      const text = extractText(result);
      if (!text) {
        return jsonResponse({ error: '模型沒有回傳內容，請再試一次' }, 502, cors);
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return jsonResponse({ error: '模型回傳格式錯誤，請再試一次' }, 502, cors);
      }

      if (!parsed?.sheets || !Array.isArray(parsed.sheets)) {
        return jsonResponse({ error: '模型回傳結構不符預期，請再試一次' }, 502, cors);
      }

      return jsonResponse({
        metadata: {
          companyName: data.companyName,
          period: data.period || '本期',
          currency: data.currency || 'NTD',
        },
        sheets: parsed.sheets,
      }, 200, cors);

    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: '伺服器錯誤，請稍後再試' }, 500, cors);
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
  const str = (k, max = 500) =>
    typeof input?.[k] === 'string' ? input[k].slice(0, max).trim() : '';
  const arr = (k, allowed) => {
    const v = input?.[k];
    if (!Array.isArray(v)) return [];
    return v.filter(x => allowed.includes(x));
  };
  return {
    companyName: str('companyName', 100),
    period: str('period', 100),
    currency: str('currency', 10) || 'NTD',
    industry: str('industry', 100),
    notes: str('notes', 500),
    instructions: arr('instructions', VALID_INSTRUCTIONS),
    restrictions: arr('restrictions', VALID_RESTRICTIONS),
    tableTypes: arr('tableTypes', Object.keys(TABLE_TYPE_NAMES)),
  };
}

function buildPrompt(d) {
  const tableNames = d.tableTypes.map(t => TABLE_TYPE_NAMES[t]).join('、');
  const c = d.currency;

  const keywordBlock = [
    `公司名稱：${d.companyName}`,
    `會計期間：${d.period || '本期'}`,
    `幣別：${c}`,
    d.industry ? `產業類型（關鍵字）：${d.industry}` : '產業類型：一般企業',
    d.notes    ? `其他需求：${d.notes}` : null,
    `需要的報表：${tableNames}`,
  ].filter(Boolean).join('\n');

  const instructionBlock = d.instructions?.length
    ? `\n【必須執行的指令】\n${d.instructions.map(s => `- ${s}`).join('\n')}`
    : '';

  const restrictionBlock = d.restrictions?.length
    ? `\n【嚴格禁止事項】\n${d.restrictions.map(s => `- ${s}`).join('\n')}`
    : '';

  return `請依照以下客戶關鍵字生成會計表格 JSON 結構。

【客戶關鍵字】
${keywordBlock}${instructionBlock}${restrictionBlock}

【輸出格式】
回傳嚴格 JSON，無任何說明文字：
{"sheets":[{"name":"...","type":"...","columns":[...],"rows":[{"type":"...","label":"...","indent":0}]}]}

Row type：
- "section"：大類標題，indent=0
- "item"：細項科目，indent=1（一般）/ indent=2（細分）
- "subtotal"：小計，indent=0
- "total"：合計，indent=0
- "space"：空白分隔行

各報表 columns 規格（必須完全照此）：
- income_statement：["科目","本期金額 (${c})","上期金額 (${c})","增減金額","增減幅度 (%)"]
- balance_sheet：["科目","本期 (${c})","上期 (${c})"]
- cash_flow：["科目","本期 (${c})","上期 (${c})"]
- monthly_expense：["費用科目","1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月","合計 (${c})"]

必須包含的科目骨幹：
- 損益表：營業收入→營業成本→毛利→各項費用→營業利益→業外損益→稅前淨利→所得稅→稅後淨利
- 資產負債表：流動資產→非流動資產→資產總計 / 流動負債→非流動負債→負債總計 / 股東權益→負債及股東權益總計
- 現金流量表：營業活動→投資活動→融資活動→期初現金→本期淨增減→期末現金
- 月費用分類帳：人事費用（薪資/勞健保）、租金、水電、辦公費、銷售費、折舊、雜支、費用合計

重要：優先依照「客戶關鍵字」中的產業類型與特殊需求調整科目，覆蓋上方預設骨幹。`;
}

function extractText(result) {
  const parts = result?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map(p => p?.text || '').join('').trim();
}
