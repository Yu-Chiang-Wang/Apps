// ===== 一次性 OAuth 授權流程 =====
// 跑一次:開啟瀏覽器 → 你點 Allow → 自動把 refresh token 存到 ~/.config/gcloud/gsc-token.json
// 之後所有腳本就能無人值守地讀 GSC 資料。

import { writeFile, chmod, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadOAuthClient, TOKEN_PATH, SCOPES } from './lib/auth.js';

const PORT = 53682;  // 隨機選一個不常用的高 port

async function main() {
  const oauth2 = await loadOAuthClient();
  // 覆寫 redirect 為帶 port 的 localhost
  oauth2.redirectUri = `http://localhost:${PORT}`;

  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',  // 確保拿到 refresh_token
    scope: SCOPES,
    state,
  });

  // 啟動本機 callback server
  const codePromise = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const err = url.searchParams.get('error');

      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>授權失敗:${err}</h2><p>可以關掉這個視窗,回終端機看錯誤。</p>`);
        server.close();
        reject(new Error(`OAuth error: ${err}`));
        return;
      }
      if (returnedState !== state) {
        res.writeHead(400);
        res.end('state mismatch');
        server.close();
        reject(new Error('state mismatch (可能是 CSRF 或重複的 callback)'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><body style="font-family:-apple-system,sans-serif;padding:40px;max-width:480px;margin:auto">
          <h2 style="color:#1d3557">授權成功 ✓</h2>
          <p style="color:#4a5e74">可以關掉這個視窗了,回到終端機繼續。</p>
        </body></html>
      `);
      server.close();
      resolve(code);
    });
    server.listen(PORT, '127.0.0.1');
    server.on('error', reject);
  });

  console.log('\n🔓 開啟瀏覽器準備授權...\n');
  console.log('如果瀏覽器沒自動打開,請手動貼這個網址:');
  console.log('\n' + authUrl + '\n');

  // 自動開瀏覽器(macOS)
  exec(`open "${authUrl.replace(/"/g, '\\"')}"`);

  const code = await codePromise;
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'Google 沒有回傳 refresh_token。可能要先到 https://myaccount.google.com/permissions 撤銷舊授權,再重跑。'
    );
  }

  await mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  await chmod(TOKEN_PATH, 0o600);

  console.log(`✓ Token 已存到:${TOKEN_PATH}`);
  console.log('  (檔案權限 600,只有你能讀)');
  console.log('\n下一步:跑 `npm run sites` 看你 GSC 註冊的網站。\n');
}

main().catch((err) => {
  console.error('\n❌ 失敗:', err.message);
  process.exit(1);
});
