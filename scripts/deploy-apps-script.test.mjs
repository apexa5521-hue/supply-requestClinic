import assert from 'node:assert/strict';
import { mergeFiles, deploy, accessToken } from './deploy-apps-script.mjs';

const cur = [{ name: 'appsscript', type: 'JSON', source: '{"timeZone":"Asia/Riyadh"}' }, { name: 'Code', type: 'SERVER_JS', source: 'old' }, { name: 'Extra', type: 'SERVER_JS', source: 'keep me' }];
const merged = mergeFiles(cur, [{ name: 'Code', type: 'SERVER_JS', source: 'new' }, { name: 'Index', type: 'HTML', source: '<html>' }]);
assert.deepEqual(merged.map(f => f.name + ':' + f.source), ['appsscript:{"timeZone":"Asia/Riyadh"}', 'Code:new', 'Extra:keep me', 'Index:<html>'], 'manifest and other files kept, ours replaced/added');

const calls = [];
const fake = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method, body: opts.body && (typeof opts.body === 'string' ? JSON.parse(opts.body) : String(opts.body)), auth: opts.headers && opts.headers.authorization });
  if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'T' }) };
  if (opts.method === 'GET') return { ok: true, json: async () => ({ files: cur }) };
  if (String(url).endsWith('/versions')) return { ok: true, json: async () => ({ versionNumber: 42 }) };
  return { ok: true, json: async () => ({}) };
};
assert.equal(await accessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, fake), 'T');
calls.length = 0;
const r = await deploy({ token: 'T', scriptId: 'SID', deploymentId: 'DEP', sources: [{ name: 'Code', type: 'SERVER_JS', source: 'new' }], description: 'auto abc', fetchFn: fake });
assert.deepEqual(calls.map(c => c.method + ' ' + c.url.replace('https://script.googleapis.com/v1/projects/', '')),
  ['GET SID/content', 'PUT SID/content', 'POST SID/versions', 'PUT SID/deployments/DEP']);
assert.equal(calls[3].body.deploymentConfig.versionNumber, 42, 'the same web-app link now serves the new version');
assert.ok(calls.every(c => c.auth === 'Bearer T'));
assert.equal(r.version, 42);
// a failure stops before touching the deployment
const bad = async (url, opts = {}) => (opts.method === 'PUT' ? { ok: false, status: 403, json: async () => ({ error: { message: 'Apps Script API not enabled' } }) } : fake(url, opts));
await assert.rejects(deploy({ token: 'T', scriptId: 'SID', deploymentId: 'DEP', sources: [], description: 'x', fetchFn: bad }), /403: Apps Script API not enabled/);
console.log('deploy-apps-script tests OK');
