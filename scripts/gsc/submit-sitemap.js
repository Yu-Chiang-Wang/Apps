// ===== 提交 sitemap 給 GSC =====
// 用法:
//   node submit-sitemap.js                              # 預設 site + /sitemap.xml
//   node submit-sitemap.js --path=sitemap.xml
//   node submit-sitemap.js --site=https://example.com/  --path=sitemap.xml
//   node submit-sitemap.js --list                       # 列出目前已提交的 sitemap

import { getWebmasters, resolveSite, parseArgs } from './lib/auth.js';

async function main() {
  const args = parseArgs(process.argv);
  const site = await resolveSite(args.site);
  const wm = await getWebmasters();

  if (args.list) {
    const res = await wm.sitemaps.list({ siteUrl: site });
    const items = res.data.sitemap || [];
    console.log(`\n📋 ${site} 已提交的 sitemap:\n`);
    if (items.length === 0) {
      console.log('  (還沒提交過)\n');
      return;
    }
    for (const s of items) {
      const errors = s.errors || 0;
      const warnings = s.warnings || 0;
      const isPending = s.isPending ? ' ⏳pending' : '';
      console.log(`  ${s.path}`);
      console.log(`    最後下載: ${s.lastDownloaded || '未知'}${isPending}`);
      console.log(`    errors=${errors}  warnings=${warnings}`);
    }
    console.log('');
    return;
  }

  const sitemapPath = args.path || 'sitemap.xml';
  const feedpath = sitemapPath.startsWith('http')
    ? sitemapPath
    : new URL(sitemapPath, site).toString();

  console.log(`\n📤 提交 sitemap...`);
  console.log(`   site:    ${site}`);
  console.log(`   sitemap: ${feedpath}\n`);

  await wm.sitemaps.submit({ siteUrl: site, feedpath });
  console.log('✓ 已提交。Google 會在接下來幾分鐘到幾小時內抓取。');
  console.log('  之後可以跑 `node submit-sitemap.js --list` 看狀態。\n');
}

main().catch((err) => {
  console.error('\n❌ 失敗:', err.message);
  process.exit(1);
});
