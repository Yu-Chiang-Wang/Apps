/* ===== PDF 轉圖片 ─ 純前端 =====
   依賴:
     - PDF.js (window.pdfjsLib)
     - JSZip  (window.JSZip)
   完全在瀏覽器內處理,檔案不上傳。
*/

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  pdfDoc: null,       // PDFDocumentProxy
  fileName: '',       // 原檔名(不含 .pdf)
  format: 'png',      // 'png' | 'jpg'
  scale: 1.5,         // PDF.js 渲染倍率
  results: [],        // [{pageNum, blob, dataUrl, ext, size}]
};

// ─── DOM ───────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const dropZone     = $('drop-zone');
const fileInput    = $('file-input');
const pickBtn      = $('pick-btn');
const fileInfo     = $('file-info');
const fileNameEl   = $('file-name');
const fileDetailEl = $('file-detail');
const resetBtn     = $('reset-btn');
const controls     = $('controls');
const scaleSelect  = $('scale-select');
const pagesInput   = $('pages-input');
const convertRow   = $('convert-row');
const convertBtn   = $('convert-btn');
const convertLabel = $('convert-btn-label');
const progress     = $('progress');
const progressFill = $('progress-fill');
const progressText = $('progress-text');
const resultToolbar= $('result-toolbar');
const resultSummary= $('result-summary');
const downloadAll  = $('download-all-btn');
const results      = $('results');
const errorMsg     = $('error-msg');

// ─── Helpers ───────────────────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.hidden = false;
}
function clearError() {
  errorMsg.hidden = true;
  errorMsg.textContent = '';
}
function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 解析使用者輸入的頁碼字串。
 * 支援:空白 = 全部、 "1,2,5"、 "1-3, 7-9"
 */
function parsePages(input, maxPage) {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return Array.from({ length: maxPage }, (_, i) => i + 1);
  }
  const set = new Set();
  for (const part of trimmed.split(',')) {
    const t = part.trim();
    if (!t) continue;
    if (t.includes('-')) {
      const [a, b] = t.split('-').map((x) => parseInt(x, 10));
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) {
        if (i >= 1 && i <= maxPage) set.add(i);
      }
    } else {
      const n = parseInt(t, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= maxPage) set.add(n);
    }
  }
  return [...set].sort((a, b) => a - b);
}

// ─── Drop Zone + File Picker ───────────────────────────────────────────────
dropZone.addEventListener('click', (e) => {
  // 別讓 link-btn 觸發兩次
  if (e.target.closest('.link-btn')) return;
  fileInput.click();
});
pickBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleFile(file);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragover');
  });
});
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) handleFile(file);
});

resetBtn.addEventListener('click', () => {
  resetAll();
});

// ─── Format toggle ─────────────────────────────────────────────────────────
controls.querySelectorAll('.seg-btn[data-format]').forEach((btn) => {
  btn.addEventListener('click', () => {
    controls.querySelectorAll('.seg-btn[data-format]')
      .forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.format = btn.dataset.format;
  });
});
scaleSelect.addEventListener('change', () => {
  state.scale = parseFloat(scaleSelect.value);
});

// ─── Load PDF ──────────────────────────────────────────────────────────────
async function handleFile(file) {
  clearError();
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    showError('只接受 PDF 檔案。');
    return;
  }

  state.fileName = file.name.replace(/\.pdf$/i, '');
  fileNameEl.textContent = file.name;
  fileDetailEl.textContent = `讀取中… · ${formatBytes(file.size)}`;
  dropZone.hidden = true;
  fileInfo.hidden = false;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    state.pdfDoc = pdf;
    fileDetailEl.textContent = `${pdf.numPages} 頁 · ${formatBytes(file.size)}`;
    pagesInput.placeholder = `全部頁面 (1-${pdf.numPages})`;
    controls.hidden = false;
    convertRow.hidden = false;
  } catch (err) {
    console.error(err);
    showError('無法讀取此 PDF,可能已損壞或加密。請換一個檔案試試。');
    resetAll();
  }
}

// ─── Convert ───────────────────────────────────────────────────────────────
convertBtn.addEventListener('click', async () => {
  if (!state.pdfDoc) return;
  clearError();

  const pages = parsePages(pagesInput.value, state.pdfDoc.numPages);
  if (pages.length === 0) {
    showError(`頁碼格式不正確。請輸入像 1-3, 5,或留空表示全部 (1-${state.pdfDoc.numPages})。`);
    return;
  }

  // reset previous results
  state.results = [];
  results.innerHTML = '';
  resultToolbar.hidden = true;

  convertBtn.disabled = true;
  convertLabel.textContent = '轉換中…';
  progress.hidden = false;
  progressFill.style.width = '0%';
  progressText.textContent = `準備轉換 ${pages.length} 頁…`;

  const mime = state.format === 'jpg' ? 'image/jpeg' : 'image/png';
  const ext  = state.format === 'jpg' ? 'jpg' : 'png';
  const quality = state.format === 'jpg' ? 0.92 : undefined;

  try {
    for (let i = 0; i < pages.length; i++) {
      const pageNum = pages[i];
      progressText.textContent = `轉換第 ${pageNum} 頁 (${i + 1}/${pages.length})…`;

      const page = await state.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: state.scale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      // JPG 不支援透明,先填白底
      if (state.format === 'jpg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, mime, quality)
      );
      if (!blob) throw new Error(`第 ${pageNum} 頁輸出失敗`);

      // 預覽用 dataURL (縮圖渲染,壓低成本)
      const previewCanvas = document.createElement('canvas');
      const previewScale = Math.min(1, 320 / canvas.width);
      previewCanvas.width = Math.max(1, Math.round(canvas.width * previewScale));
      previewCanvas.height = Math.max(1, Math.round(canvas.height * previewScale));
      previewCanvas.getContext('2d')
        .drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
      const previewUrl = previewCanvas.toDataURL('image/jpeg', 0.75);

      const result = {
        pageNum,
        blob,
        previewUrl,
        ext,
        size: blob.size,
      };
      state.results.push(result);
      renderResultCard(result);

      progressFill.style.width = `${Math.round(((i + 1) / pages.length) * 100)}%`;

      // 釋放 canvas 記憶體
      canvas.width = canvas.height = 0;

      // 讓 UI 喘口氣
      await new Promise((r) => setTimeout(r, 0));
    }

    progressText.textContent = `完成 — 共轉換 ${state.results.length} 頁`;
    const totalSize = state.results.reduce((a, r) => a + r.size, 0);
    resultSummary.textContent = `${state.results.length} 張圖片 · ${formatBytes(totalSize)}`;
    resultToolbar.hidden = false;
  } catch (err) {
    console.error(err);
    showError(`轉換時發生錯誤:${err.message || err}`);
    progressText.textContent = '已中止';
  } finally {
    convertBtn.disabled = false;
    convertLabel.textContent = '重新轉換';
  }
});

// ─── Render a result card ──────────────────────────────────────────────────
function renderResultCard(r) {
  const card = document.createElement('div');
  card.className = 'result-card';

  const filename = `${state.fileName}-page-${String(r.pageNum).padStart(3, '0')}.${r.ext}`;

  card.innerHTML = `
    <div class="result-preview">
      <img alt="第 ${r.pageNum} 頁預覽" src="${r.previewUrl}">
    </div>
    <div class="result-meta">
      <div class="result-label">
        <span class="result-page">第 ${r.pageNum} 頁</span>
        <span class="result-size">${r.ext.toUpperCase()} · ${formatBytes(r.size)}</span>
      </div>
      <button type="button" class="btn-download">下載</button>
    </div>
  `;
  card.querySelector('.btn-download').addEventListener('click', () => {
    downloadBlob(r.blob, filename);
  });
  results.appendChild(card);
}

// ─── Download All as ZIP ───────────────────────────────────────────────────
downloadAll.addEventListener('click', async () => {
  if (state.results.length === 0) return;
  downloadAll.disabled = true;
  const originalLabel = downloadAll.textContent;
  downloadAll.textContent = '打包中…';

  try {
    const zip = new JSZip();
    for (const r of state.results) {
      const filename = `${state.fileName}-page-${String(r.pageNum).padStart(3, '0')}.${r.ext}`;
      zip.file(filename, r.blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${state.fileName}-images.zip`);
  } catch (err) {
    console.error(err);
    showError(`打包 ZIP 失敗:${err.message || err}`);
  } finally {
    downloadAll.disabled = false;
    downloadAll.textContent = originalLabel;
  }
});

// ─── Reset ─────────────────────────────────────────────────────────────────
function resetAll() {
  state.pdfDoc = null;
  state.fileName = '';
  state.results = [];
  results.innerHTML = '';
  fileInfo.hidden = true;
  controls.hidden = true;
  convertRow.hidden = true;
  progress.hidden = true;
  resultToolbar.hidden = true;
  dropZone.hidden = false;
  convertLabel.textContent = '開始轉換';
  convertBtn.disabled = false;
  pagesInput.value = '';
  clearError();
}
