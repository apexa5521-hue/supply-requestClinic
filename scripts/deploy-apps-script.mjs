// Updates the Apps Script project (plan B: the GitHub link) from this repository, then points the
// existing web-app deployment at a new version — same /exec link, no manual copy and paste.
// Only Code / Index / JavaScript are replaced; every other file in the project (and its manifest) is kept.
// Env: GAS_CLIENT_ID, GAS_CLIENT_SECRET, GAS_REFRESH_TOKEN, SCRIPT_ID, DEPLOYMENT_ID (optional: version only).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://script.googleapis.com/v1/projects/';
export const FILES = [
  { name: 'Code', type: 'SERVER_JS', path: 'Code.gs' },
  { name: 'Index', type: 'HTML', path: 'Index.html' },
  { name: 'JavaScript', type: 'HTML', path: 'JavaScript.html' }
];

async function req(fetchFn, method, url, token, body) {
  const res = await fetchFn(url, { method, headers: Object.assign({ authorization: 'Bearer ' + token }, body ? { 'content-type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(method + ' ' + url.replace(API, '') + ' → ' + res.status + ': ' + ((j.error && j.error.message) || ''));
  return j;
}

export async function accessToken({ clientId, clientSecret, refreshToken }, fetchFn = fetch) {
  const res = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error('google token: ' + (j.error_description || j.error || res.status));
  return j.access_token;
}

/** current project files + our three sources (others untouched) */
export function mergeFiles(current, sources) {
  const out = (current || []).map(f => ({ name: f.name, type: f.type, source: f.source }));
  sources.forEach(s => {
    const i = out.findIndex(f => f.name === s.name && f.type === s.type);
    if (i === -1) out.push(s); else out[i] = s;
  });
  return out;
}

export async function deploy({ token, scriptId, deploymentId, sources, description, fetchFn = fetch }) {
  const cur = await req(fetchFn, 'GET', API + scriptId + '/content', token);
  const files = mergeFiles(cur.files, sources);
  await req(fetchFn, 'PUT', API + scriptId + '/content', token, { files });
  const ver = await req(fetchFn, 'POST', API + scriptId + '/versions', token, { description });
  if (deploymentId) {
    await req(fetchFn, 'PUT', API + scriptId + '/deployments/' + deploymentId, token, {
      deploymentConfig: { scriptId, versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description } });
  }
  return { files: files.map(f => f.name), version: ver.versionNumber, deployment: deploymentId || null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sources = FILES.map(f => ({ name: f.name, type: f.type, source: fs.readFileSync(path.join(root, f.path), 'utf8') }));
  const sha = (env.GITHUB_SHA || 'manual').slice(0, 7);
  accessToken({ clientId: env.GAS_CLIENT_ID, clientSecret: env.GAS_CLIENT_SECRET, refreshToken: env.GAS_REFRESH_TOKEN })
    .then(token => deploy({ token, scriptId: env.SCRIPT_ID, deploymentId: env.DEPLOYMENT_ID, sources, description: 'auto ' + sha }))
    .then(r => console.log('Apps Script updated:', JSON.stringify(r)))
    .catch(e => { console.error('Apps Script update failed:', e.message); process.exit(1); });
}
