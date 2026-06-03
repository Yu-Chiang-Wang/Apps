// ===== GSC OAuth 共用 helper =====
// 載入 OAuth client → 從本機 token 檔取得 refresh token → 回傳已 authorize 的 client。
// 首次執行需跑 auth.js 完成瀏覽器授權。

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { google } from 'googleapis';

const CONFIG_DIR     = path.join(homedir(), '.config', 'gcloud');
export const CLIENT_PATH = process.env.GSC_OAUTH_CLIENT
  || path.join(CONFIG_DIR, 'gsc-oauth-client.json');
export const TOKEN_PATH  = process.env.GSC_TOKEN_PATH
  || path.join(CONFIG_DIR, 'gsc-token.json');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'gsc-config.json');

export const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
];

export async function loadOAuthClient() {
  if (!existsSync(CLIENT_PATH)) {
    throw new Error(`找不到 OAuth client: ${CLIENT_PATH}`);
  }
  const raw = JSON.parse(await readFile(CLIENT_PATH, 'utf-8'));
  const cfg = raw.installed || raw.web;
  if (!cfg) throw new Error('OAuth client 格式不對(需 installed 或 web)');

  const redirectUri = (cfg.redirect_uris && cfg.redirect_uris[0]) || 'http://localhost';
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, redirectUri);
}

export async function getAuthorizedClient() {
  const oauth2 = await loadOAuthClient();
  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      `尚未授權。請先執行:\n  cd scripts/gsc && npm run auth`
    );
  }
  const tokens = JSON.parse(await readFile(TOKEN_PATH, 'utf-8'));
  oauth2.setCredentials(tokens);
  return oauth2;
}

export async function getWebmasters() {
  const auth = await getAuthorizedClient();
  return google.webmasters({ version: 'v3', auth });
}

export async function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export async function resolveSite(cliArg) {
  if (cliArg) return cliArg;
  if (process.env.GSC_SITE) return process.env.GSC_SITE;
  const cfg = await loadConfig();
  if (cfg.site) return cfg.site;
  throw new Error(
    '找不到 GSC site,請用 --site=... 指定,或執行 `npm run sites` 後設定。'
  );
}

export function parseArgs(argv) {
  const args = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith('--')) args[a.slice(2)] = true;
  }
  return args;
}
