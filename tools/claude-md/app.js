// ===== CLAUDE.md 產生器 前端邏輯 =====
// API endpoint:Worker 部署完成後改成你的 Worker URL,例如:
//   https://claude-md.<your-subdomain>.workers.dev
// 本機開發時可指向 wrangler dev 的位址(預設 http://127.0.0.1:8787)。
const API_ENDPOINT = 'https://claude-md.jonathanwang1103.workers.dev';

const form = document.getElementById('claude-md-form');
const result = document.getElementById('result');
const submitBtn = document.getElementById('submit-btn');
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');
const readmeEl = document.getElementById('readme');
const parseReadmeBtn = document.getElementById('parse-readme');

const fields = {
  projectName: document.getElementById('projectName'),
  description: document.getElementById('description'),
  commands: document.getElementById('commands'),
  conventions: document.getElementById('conventions'),
  aiNotes: document.getElementById('aiNotes'),
  donts: document.getElementById('donts'),
};

function getChipValues(groupId, customId) {
  const checked = [...document.querySelectorAll(`#${groupId} input:checked`)]
    .map(cb => cb.value)
    .filter(v => v !== '__other__');
  const custom = document.getElementById(customId).value.trim();
  if (custom) custom.split(',').map(s => s.trim()).filter(Boolean).forEach(v => checked.push(v));
  return checked.join(', ');
}

function setupOtherChip(cbId, inputId) {
  document.getElementById(cbId).addEventListener('change', function () {
    const input = document.getElementById(inputId);
    input.classList.toggle('visible', this.checked);
    if (!this.checked) input.value = '';
  });
}
setupOtherChip('lang-other-cb', 'languages-custom');
setupOtherChip('fw-other-cb', 'frameworks-custom');

let lastMarkdown = '';

// ===== 主流程:送出表單 → 呼叫 Worker =====
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const projectName = fields.projectName.value.trim();
  const description = fields.description.value.trim();
  if (!projectName || !description) {
    setResult('請至少填寫「專案名稱」與「一句話描述」。', { error: true });
    return;
  }

  const payload = {
    projectName,
    description,
    languages: getChipValues('languages-chips', 'languages-custom'),
    frameworks: getChipValues('frameworks-chips', 'frameworks-custom'),
    commands: fields.commands.value.trim(),
    conventions: fields.conventions.value.trim(),
    aiNotes: fields.aiNotes.value.trim(),
    donts: fields.donts.value.trim(),
    readmeContent: readmeEl.value.trim().slice(0, 8000),
  };

  setLoading(true);

  try {
    const res = await fetch(`${API_ENDPOINT}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const msg = errJson?.error || `伺服器回傳 ${res.status}`;
      throw new Error(msg);
    }

    const data = await res.json();
    const md = (data?.markdown || '').trim();
    if (!md) throw new Error('回傳內容是空的,請再試一次。');

    lastMarkdown = md;
    setResult(md, { error: false });
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
  } catch (err) {
    setResult(`產生失敗:${err.message}`, { error: true });
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
  } finally {
    setLoading(false);
  }
});

// ===== 複製 =====
copyBtn.addEventListener('click', async () => {
  if (!lastMarkdown) return;
  try {
    await navigator.clipboard.writeText(lastMarkdown);
    copyBtn.textContent = '已複製!';
  } catch {
    copyBtn.textContent = '複製失敗';
  }
  setTimeout(() => (copyBtn.textContent = '複製'), 1500);
});

// ===== 下載 =====
downloadBtn.addEventListener('click', () => {
  if (!lastMarkdown) return;
  const blob = new Blob([lastMarkdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'CLAUDE.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ===== 簡易 README 解析:抽出第一個 H1 與第一段內文 =====
parseReadmeBtn.addEventListener('click', () => {
  const text = readmeEl.value.trim();
  if (!text) {
    flashBtn(parseReadmeBtn, '請先貼上 README');
    return;
  }

  // 第一個 # heading
  const h1 = text.match(/^#\s+(.+?)\s*$/m);
  if (h1 && !fields.projectName.value.trim()) {
    fields.projectName.value = h1[1].replace(/[`*_]/g, '').trim();
  }

  // 第一段非 heading、非 badge 的純文字
  const lines = text.split('\n');
  let desc = '';
  let passedH1 = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) { passedH1 = true; continue; }
    if (!passedH1) continue;
    if (/^[!\[<>`-]/.test(line)) continue; // 跳過 badge / 圖片 / 引言 / 列表
    if (line.startsWith('|') || line.startsWith('```')) continue;
    desc = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*_]/g, '').trim();
    break;
  }
  if (desc && !fields.description.value.trim()) {
    fields.description.value = desc.slice(0, 140);
  }

  flashBtn(parseReadmeBtn, '已填入!');
});

// ===== Helpers =====
function setResult(text, { error }) {
  result.textContent = text;
  result.classList.toggle('is-error', !!error);
  result.classList.remove('is-loading');
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? '生成中...' : '產生 CLAUDE.md';
  if (loading) {
    result.textContent = 'AI 正在思考,請稍候 ';
    result.classList.add('is-loading');
    result.classList.remove('is-error');
    copyBtn.disabled = true;
    downloadBtn.disabled = true;
  }
}

function flashBtn(btn, msg) {
  const original = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => (btn.textContent = original), 1600);
}
