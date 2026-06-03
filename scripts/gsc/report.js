// ===== GSC 表現報告 =====
// 用法:
//   node report.js                       # 預設最近 28 天 + 預設 site
//   node report.js --days=7
//   node report.js --dim=page            # query (預設) | page | country | device | date
//   node report.js --site=sc-domain:...
//   node report.js --rows=50
//   node report.js --filter=apps         # 模糊比對 query/page 字串
//
// 輸出純文字表格(對 Claude 友善)。

import { getWebmasters, resolveSite, parseArgs } from './lib/auth.js';

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}
function pct(n) {
  return (n * 100).toFixed(2) + '%';
}
function pad(s, n) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n - 1) + '…';
  return s + ' '.repeat(n - s.length);
}

async function main() {
  const args = parseArgs(process.argv);
  const days = parseInt(args.days || '28', 10);
  const dim = args.dim || 'query';
  const rows = parseInt(args.rows || '20', 10);
  const filter = args.filter;
  const site = await resolveSite(args.site);

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);

  const wm = await getWebmasters();
  const request = {
    siteUrl: site,
    requestBody: {
      startDate: fmtDate(start),
      endDate: fmtDate(end),
      dimensions: [dim],
      rowLimit: rows,
    },
  };

  if (filter) {
    request.requestBody.dimensionFilterGroups = [
      {
        filters: [
          {
            dimension: dim === 'page' ? 'page' : 'query',
            operator: 'contains',
            expression: filter,
          },
        ],
      },
    ];
  }

  const res = await wm.searchanalytics.query(request);
  const data = res.data.rows || [];

  console.log(`\n📊 ${site}`);
  console.log(`   區間: ${fmtDate(start)} → ${fmtDate(end)} (${days} 天)`);
  console.log(`   維度: ${dim}${filter ? `   過濾: "${filter}"` : ''}`);
  console.log(`   共 ${data.length} 筆\n`);

  if (data.length === 0) {
    console.log('(沒有資料)\n');
    return;
  }

  // 表頭
  const dimWidth = dim === 'page' ? 56 : 36;
  console.log(
    pad(dim, dimWidth) +
    pad('Clicks', 9) +
    pad('Impr.', 9) +
    pad('CTR', 9) +
    pad('Pos.', 7)
  );
  console.log('─'.repeat(dimWidth + 9 + 9 + 9 + 7));

  for (const r of data) {
    console.log(
      pad(r.keys[0], dimWidth) +
      pad(String(r.clicks), 9) +
      pad(String(r.impressions), 9) +
      pad(pct(r.ctr), 9) +
      pad(r.position.toFixed(1), 7)
    );
  }

  // 總計
  const totals = data.reduce(
    (a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }),
    { c: 0, i: 0 }
  );
  console.log('─'.repeat(dimWidth + 9 + 9 + 9 + 7));
  console.log(
    pad('TOTAL (top ' + data.length + ')', dimWidth) +
    pad(String(totals.c), 9) +
    pad(String(totals.i), 9) +
    pad(totals.i ? pct(totals.c / totals.i) : '-', 9)
  );
  console.log('');
}

main().catch((err) => {
  console.error('\n❌ 失敗:', err.message);
  process.exit(1);
});
