// ===== 列出 GSC 註冊的所有資源 =====
// 第一次用完 auth.js 後,跑這個確認可讀到網站清單。
// 同時把第一個網站存為預設 site,後續 report.js 不用每次指定。

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { getWebmasters, loadConfig, CONFIG_PATH } from './lib/auth.js';

async function main() {
  const wm = await getWebmasters();
  const res = await wm.sites.list();
  const sites = res.data.siteEntry || [];

  if (sites.length === 0) {
    console.log('沒有任何 GSC 資源(這個 Google 帳號還沒驗證任何網站)。');
    return;
  }

  console.log('\nGSC 註冊的資源:\n');
  for (const s of sites) {
    console.log(`  ${s.permissionLevel.padEnd(20)}  ${s.siteUrl}`);
  }

  // 自動猜測 Apps 站
  const guess =
    sites.find((s) => /yu-chiang-wang\.github\.io/.test(s.siteUrl)) ||
    sites[0];

  const cfg = await loadConfig();
  if (!cfg.site && guess) {
    cfg.site = guess.siteUrl;
    await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    console.log(`\n✓ 已設為預設 site: ${guess.siteUrl}`);
    console.log(`  (存於 ${CONFIG_PATH})`);
  } else if (cfg.site) {
    console.log(`\n目前預設 site: ${cfg.site}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\n❌ 失敗:', err.message);
  process.exit(1);
});
