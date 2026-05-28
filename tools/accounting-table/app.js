// ===== 會計表格產生器 前端邏輯 =====
// Worker 部署完成後，改成你的 Worker URL:
//   wrangler deploy --config worker/wrangler-accounting.toml
const API_ENDPOINT = 'https://accounting-table.jonathanwang1103.workers.dev';

const form = document.getElementById('accounting-form');
const submitBtn = document.getElementById('submit-btn');
const downloadBtn = document.getElementById('download-btn');
const retryBtn = document.getElementById('retry-btn');

const periodSelect = document.getElementById('periodSelect');
const periodCustom = document.getElementById('periodCustom');

periodSelect.addEventListener('change', () => {
  const isCustom = periodSelect.value === '__custom__';
  periodCustom.hidden = !isCustom;
  if (isCustom) periodCustom.focus();
});

const resultPlaceholder = document.getElementById('result-placeholder');
const resultReady = document.getElementById('result-ready');
const resultLoading = document.getElementById('result-loading');
const resultError = document.getElementById('result-error');
const sheetList = document.getElementById('sheet-list');
const errorMsg = document.getElementById('error-msg');

let lastGeneratedData = null;

// ===== 主流程 =====
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const companyName = document.getElementById('companyName').value.trim();
  const period = periodSelect.value === '__custom__'
    ? periodCustom.value.trim()
    : periodSelect.value;
  if (!companyName || !period) {
    showError('請至少填寫「公司名稱」與「會計期間」。');
    return;
  }

  const tableTypes = [...document.querySelectorAll('#table-type-chips input:checked')].map(cb => cb.value);
  if (tableTypes.length === 0) {
    showError('請至少選擇一種報表類型。');
    return;
  }

  const instructions = [...document.querySelectorAll('#instruction-chips input:checked')].map(cb => cb.value);
  const restrictions = [...document.querySelectorAll('#restriction-chips input:checked')].map(cb => cb.value);

  const payload = {
    companyName,
    period,
    currency: document.getElementById('currency').value,
    industry: document.getElementById('industry').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    instructions,
    restrictions,
    tableTypes,
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
      throw new Error(errJson?.error || `伺服器回傳 ${res.status}`);
    }

    const data = await res.json();
    if (!data?.sheets?.length) throw new Error('回傳的表格結構為空，請再試一次。');

    lastGeneratedData = data;
    showReady(data);
  } catch (err) {
    showError(`產生失敗：${err.message}`);
  } finally {
    setLoading(false);
  }
});

downloadBtn.addEventListener('click', () => {
  if (lastGeneratedData) generateExcel(lastGeneratedData);
});

retryBtn.addEventListener('click', () => {
  showPlaceholder();
});

// ===== 狀態切換 =====
function showPlaceholder() {
  resultPlaceholder.hidden = false;
  resultReady.hidden = true;
  resultLoading.hidden = true;
  resultError.hidden = true;
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? '生成中...' : '產生 Excel 表格';
  resultPlaceholder.hidden = loading ? false : true;
  resultLoading.hidden = !loading;
  resultReady.hidden = true;
  resultError.hidden = true;
  if (!loading) resultPlaceholder.hidden = false;
}

function showReady(data) {
  resultPlaceholder.hidden = true;
  resultLoading.hidden = true;
  resultError.hidden = true;
  resultReady.hidden = false;

  sheetList.innerHTML = data.sheets.map(s => `
    <li class="sheet-item">
      <span class="sheet-check">✓</span>
      <span class="sheet-name">${s.name}</span>
      <span class="sheet-rows">${s.rows?.length ?? 0} 行</span>
    </li>
  `).join('');
}

function showError(msg) {
  resultPlaceholder.hidden = true;
  resultLoading.hidden = true;
  resultReady.hidden = true;
  resultError.hidden = false;
  errorMsg.textContent = msg;
}

// ===== Excel 產生 =====
function generateExcel(data) {
  const wb = XLSX.utils.book_new();

  for (const sheet of data.sheets) {
    const ws = buildWorksheet(sheet, data.metadata);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }

  const filename = `${data.metadata.companyName}_${data.metadata.period}.xlsx`
    .replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(wb, filename);
}

function buildWorksheet(sheet, metadata) {
  const numCols = sheet.columns?.length || 2;
  const isMonthly = sheet.type === 'monthly_expense';
  const monthCount = isMonthly ? numCols - 2 : 0; // 12 month columns (index 1-12)

  const aoa = [];
  const rowMeta = [];

  // Header rows (merged across all columns)
  aoa.push([metadata.companyName, ...Array(numCols - 1).fill(null)]);
  rowMeta.push('company-name');
  aoa.push([sheet.name, ...Array(numCols - 1).fill(null)]);
  rowMeta.push('sheet-name');
  aoa.push([`會計期間：${metadata.period}　　幣別：${metadata.currency}`, ...Array(numCols - 1).fill(null)]);
  rowMeta.push('period');
  aoa.push(Array(numCols).fill(null));
  rowMeta.push('empty');

  // Column header row
  aoa.push([...(sheet.columns || [])]);
  rowMeta.push('col-header');

  // Data rows
  let sectionItemRows = [];

  for (const row of sheet.rows || []) {
    const excelRow = aoa.length + 1; // 1-indexed Excel row number

    switch (row.type) {
      case 'space': {
        aoa.push(Array(numCols).fill(null));
        rowMeta.push('empty');
        break;
      }

      case 'section': {
        sectionItemRows = [];
        aoa.push([row.label, ...Array(numCols - 1).fill(null)]);
        rowMeta.push('section');
        break;
      }

      case 'item': {
        const indent = '　'.repeat(row.indent || 1); // full-width space
        const cells = [indent + row.label];

        if (isMonthly) {
          // Fill months as empty, total col = SUM(B:M for this row)
          for (let c = 0; c < monthCount; c++) cells.push(null);
          const firstCol = XLSX.utils.encode_col(1);
          const lastCol = XLSX.utils.encode_col(monthCount);
          cells.push({ f: `SUM(${firstCol}${excelRow}:${lastCol}${excelRow})` });
        } else {
          for (let c = 1; c < numCols; c++) cells.push(null);
        }

        aoa.push(cells);
        rowMeta.push('item');
        sectionItemRows.push(excelRow);
        break;
      }

      case 'subtotal':
      case 'total': {
        const cells = [row.label];

        if (isMonthly) {
          for (let c = 1; c <= monthCount; c++) {
            const col = XLSX.utils.encode_col(c);
            if (sectionItemRows.length > 0) {
              cells.push({ f: `SUM(${col}${sectionItemRows[0]}:${col}${sectionItemRows.at(-1)})` });
            } else {
              cells.push(null);
            }
          }
          const firstCol = XLSX.utils.encode_col(1);
          const lastCol = XLSX.utils.encode_col(monthCount);
          cells.push({ f: `SUM(${firstCol}${excelRow}:${lastCol}${excelRow})` });
        } else {
          for (let c = 1; c < numCols; c++) {
            const col = XLSX.utils.encode_col(c);
            if (sectionItemRows.length > 0) {
              cells.push({ f: `SUM(${col}${sectionItemRows[0]}:${col}${sectionItemRows.at(-1)})` });
            } else {
              cells.push(null);
            }
          }
        }

        aoa.push(cells);
        rowMeta.push(row.type);

        if (row.type === 'subtotal') {
          sectionItemRows = [excelRow];
        } else {
          sectionItemRows = [];
        }
        break;
      }

      default: {
        aoa.push([row.label || '', ...Array(numCols - 1).fill(null)]);
        rowMeta.push('item');
        if (row.label) sectionItemRows.push(excelRow);
        break;
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa, { nullError: false });

  // Column widths
  ws['!cols'] = (sheet.columns || []).map((_, i) => ({
    wch: i === 0 ? 34 : isMonthly ? 9 : 20,
  }));

  // Row heights
  ws['!rows'] = rowMeta.map(t => ({
    hpt: t === 'company-name' ? 26 : t === 'sheet-name' ? 22 : t === 'empty' ? 8 : 18,
  }));

  // Merges for the 3 header rows + spacer
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: numCols - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: numCols - 1 } },
  ];

  // Apply cell styles
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = range.s.r; r <= range.e.r; r++) {
    const meta = rowMeta[r] || 'item';
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { v: '', t: 's' };
      ws[ref].s = cellStyle(meta, c, numCols);
    }
  }

  return ws;
}

// ===== 樣式定義 =====
const BORDER_LIGHT = { style: 'thin', color: { rgb: 'E5E5E5' } };
const BORDER_MID   = { style: 'thin', color: { rgb: '457b9d' } };
const BORDER_DARK  = { style: 'medium', color: { rgb: '1d3557' } };
const BORDER_DBL   = { style: 'double', color: { rgb: '1d3557' } };

function cellStyle(rowType, col, numCols) {
  const isFirstCol = col === 0;

  const base = {
    alignment: {
      vertical: 'center',
      horizontal: isFirstCol ? 'left' : 'right',
      wrapText: false,
    },
    border: {
      top: BORDER_LIGHT, bottom: BORDER_LIGHT,
      left: BORDER_LIGHT, right: BORDER_LIGHT,
    },
  };

  switch (rowType) {
    case 'company-name':
      return {
        font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1d3557' }, patternType: 'solid' },
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {},
      };
    case 'sheet-name':
      return {
        font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '457b9d' }, patternType: 'solid' },
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {},
      };
    case 'period':
      return {
        font: { sz: 10, color: { rgb: '4a5e74' } },
        fill: { fgColor: { rgb: 'EEF2F7' }, patternType: 'solid' },
        alignment: { vertical: 'center', horizontal: 'center' },
        border: {},
      };
    case 'empty':
      return { border: {} };
    case 'col-header':
      return {
        font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1d3557' }, patternType: 'solid' },
        alignment: {
          vertical: 'center',
          horizontal: isFirstCol ? 'left' : 'center',
          wrapText: true,
        },
        border: {
          top: BORDER_DARK, bottom: BORDER_DARK,
          left: BORDER_DARK, right: BORDER_DARK,
        },
      };
    case 'section':
      return {
        ...base,
        font: { bold: true, sz: 10, color: { rgb: '1d3557' } },
        fill: { fgColor: { rgb: 'EEF2F7' }, patternType: 'solid' },
        alignment: { vertical: 'center', horizontal: 'left' },
      };
    case 'subtotal':
      return {
        ...base,
        font: { bold: true, sz: 10 },
        fill: { fgColor: { rgb: 'F8F9FA' }, patternType: 'solid' },
        border: {
          top: BORDER_MID, bottom: BORDER_MID,
          left: BORDER_LIGHT, right: BORDER_LIGHT,
        },
      };
    case 'total':
      return {
        ...base,
        font: { bold: true, sz: 10, color: { rgb: '1d3557' } },
        fill: { fgColor: { rgb: 'A8DADC' }, patternType: 'solid' },
        border: {
          top: BORDER_DARK, bottom: BORDER_DBL,
          left: BORDER_DARK, right: BORDER_DARK,
        },
      };
    default: // item
      return {
        ...base,
        font: { sz: 10 },
        fill: { fgColor: { rgb: 'FFFFFF' }, patternType: 'solid' },
      };
  }
}
