// PostgreSQL persistence for the Apps Script runtime: each sheet is one row (JSONB grid),
// script properties + cache in a key/value table, and Drive files as bytea.
import crypto from 'node:crypto';
import { driveAccessToken, uploadDriveFile } from './drive.mjs';

const SCHEMA = `
create table if not exists gas_sheets (name text primary key, ord int not null default 0, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists gas_kv (kind text not null, k text not null, v text not null, exp bigint, primary key (kind, k));
create table if not exists gas_files (id text primary key, name text, mime text, bytes bytea, created_at timestamptz not null default now());
alter table gas_files add column if not exists drive_id text;
alter table gas_files alter column bytes drop not null;
`;

// ---- storage guard: the free database has a hard size limit (Supabase free: 500 MB) ----
// Photos that cannot go to Drive stay in the database, so they stop at PHOTO_STOP of the limit;
// text (requests, approvals) keeps working until TEXT_STOP. A save that is refused is never silently dropped:
// it fails with ERR_STORAGE_FULL and nothing of that save is written.
export const PHOTO_STOP = 0.8, TEXT_STOP = 0.97;
export class StorageFullError extends Error {
  constructor(usedMb, limitMb) { super('ERR_STORAGE_FULL'); this.code = 'ERR_STORAGE_FULL'; this.usedMb = usedMb; this.limitMb = limitMb; }
}
export function storageState(usedBytes, limitMb) {
  const used = usedBytes / 1048576, pct = used / limitMb;
  return { usedMb: Math.round(used * 10) / 10, limitMb, percent: Math.round(pct * 1000) / 10, photosBlocked: pct >= PHOTO_STOP, textBlocked: pct >= TEXT_STOP };
}

const isDate = v => Object.prototype.toString.call(v) === '[object Date]';
// Dates survive JSON as {"$d": iso}; revived as Dates of the runtime realm (vm context)
export function encodeGrid(rows) {
  return JSON.stringify(rows, function (k, v) { const raw = this[k]; return isDate(raw) ? { $d: isNaN(raw) ? null : raw.toISOString() } : v; });
}
export function decodeGrid(json, DateCtor) {
  return JSON.parse(json, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && '$d' in v ? (v.$d ? new DateCtor(v.$d) : '') : v));
}
const hash = s => crypto.createHash('md5').update(s).digest('hex');

export class Store {
  // drive: { cfg, token?, upload } or null. With Drive set up, new files go to Drive and only the id is kept.
  constructor(pool, drive = null, limitMb = Number(process.env.DB_LIMIT_MB) || 500) { this.pool = pool; this.drive = drive; this.limitMb = limitMb; this.sheetHash = {}; this.kvHash = { prop: '', cache: '' }; }

  async init() { await this.pool.query(SCHEMA); }

  async load(gas, DateCtor) {
    const { rows } = await this.pool.query('select name, data::text as data from gas_sheets order by ord, name');
    rows.forEach(r => {
      const sh = gas.ss.insertSheet(r.name);
      sh._data = decodeGrid(r.data, DateCtor);
      this.sheetHash[r.name] = hash(r.data);
    });
    const kv = await this.pool.query('select kind, k, v, exp from gas_kv');
    kv.rows.forEach(r => {
      if (r.kind === 'prop') gas.props[r.k] = r.v;
      else if (r.kind === 'cache' && Number(r.exp) > Date.now()) gas.cacheStore[r.k] = { v: r.v, exp: Number(r.exp) };
    });
    this.kvHash.prop = hash(JSON.stringify(gas.props));
    this.kvHash.cache = hash(JSON.stringify(gas.cacheStore));
    const fl = await this.pool.query('select id, name, mime, bytes, drive_id from gas_files');
    // bytes of Drive files are not reloaded at boot; /files/:id redirects to Drive for them
    fl.rows.forEach(f => gas.files.set(f.id, { id: f.id, name: f.name, mime: f.mime, bytes: f.bytes, driveId: f.drive_id || '', saved: true }));
    return { sheets: rows.length, props: Object.keys(gas.props).length, files: fl.rows.length };
  }

  // writes everything that changed since the last flush, in one transaction
  async flush(gas) {
    const sheetUps = [], sheetDels = Object.keys(this.sheetHash).filter(n => !gas.sheets[n]);
    gas.order.forEach((name, i) => {
      const json = encodeGrid(gas.sheets[name]._data), h = hash(json);
      if (this.sheetHash[name] !== h) sheetUps.push({ name, i, json, h });
    });
    const propsJson = JSON.stringify(gas.props), cacheJson = JSON.stringify(gas.cacheStore);
    const propsDirty = hash(propsJson) !== this.kvHash.prop, cacheDirty = hash(cacheJson) !== this.kvHash.cache;
    const newFiles = [...gas.files.values()].filter(f => !f.saved);
    if (!sheetUps.length && !sheetDels.length && !propsDirty && !cacheDirty && !newFiles.length) return 0;
    // data changes (requests, approvals...) stop only when the database is almost full
    if (sheetUps.length || sheetDels.length) await this.checkTextRoom();
    // Drive uploads happen before the transaction (network); a failed upload keeps the bytes in the database
    for (const f of newFiles) {
      if (f.driveId || !this.drive) continue;
      try {
        if (!this.drive.token) this.drive.token = await driveAccessToken(this.drive.cfg);
        f.driveId = await uploadDriveFile({ token: this.drive.token, name: f.name, mime: f.mime, bytes: f.bytes, folderId: this.drive.cfg.folderId });
      } catch (e) {
        console.error('Drive upload failed, keeping file in database:', f.name, e.message);
        if (/token/.test(e.message)) this.drive.token = null;
      }
    }
    // photos that must stay in the database: refuse them when the database is nearly full (see storage guard)
    const inDb = newFiles.filter(f => !f.driveId);
    if (inDb.length) {
      const st = storageState(await this.dbBytes(), this.limitMb);
      if (st.photosBlocked) throw new StorageFullError(st.usedMb, st.limitMb);
    }
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      for (const s of sheetUps) {
        await c.query('insert into gas_sheets (name, ord, data, updated_at) values ($1, $2, $3::jsonb, now()) on conflict (name) do update set ord = excluded.ord, data = excluded.data, updated_at = now()', [s.name, s.i, s.json]);
      }
      for (const n of sheetDels) await c.query('delete from gas_sheets where name = $1', [n]);
      if (propsDirty) await this.replaceKv(c, 'prop', Object.entries(gas.props).map(([k, v]) => [k, v, null]));
      if (cacheDirty) {
        const now = Date.now();
        await this.replaceKv(c, 'cache', Object.entries(gas.cacheStore).filter(([, e]) => e.exp > now).map(([k, e]) => [k, e.v, e.exp]));
      }
      for (const f of newFiles) {
        // with a Drive id the bytes are not kept in the database
        const bytes = f.driveId ? null : f.bytes;
        await c.query('insert into gas_files (id, name, mime, bytes, drive_id) values ($1, $2, $3, $4, $5) on conflict (id) do nothing', [f.id, f.name, f.mime, bytes, f.driveId || null]);
      }
      await c.query('commit');
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
    sheetUps.forEach(s => { this.sheetHash[s.name] = s.h; });
    sheetDels.forEach(n => { delete this.sheetHash[n]; });
    if (propsDirty) this.kvHash.prop = hash(propsJson);
    if (cacheDirty) this.kvHash.cache = hash(cacheJson);
    newFiles.forEach(f => { f.saved = true; });
    return sheetUps.length + sheetDels.length + (propsDirty ? 1 : 0) + (cacheDirty ? 1 : 0) + newFiles.length;
  }

  /** size of the whole database in bytes (cached 60 s: the check runs on every save) */
  async dbBytes() {
    const now = Date.now();
    if (this._size && now - this._size.at < 60000) return this._size.bytes;
    const r = await this.pool.query('select pg_database_size(current_database())::bigint as b');
    this._size = { at: now, bytes: Number(r.rows[0].b) };
    return this._size.bytes;
  }

  /** text saves are refused only at TEXT_STOP (checked by the caller before writing text) */
  async checkTextRoom() {
    const st = storageState(await this.dbBytes(), this.limitMb);
    if (st.textBlocked) throw new StorageFullError(st.usedMb, st.limitMb);
    return st;
  }

  async replaceKv(c, kind, entries) {
    await c.query('delete from gas_kv where kind = $1', [kind]);
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500), vals = [], args = [];
      chunk.forEach(([k, v, exp], j) => { vals.push(`($1, $${j * 3 + 2}, $${j * 3 + 3}, $${j * 3 + 4})`); args.push(k, v, exp); });
      await c.query('insert into gas_kv (kind, k, v, exp) values ' + vals.join(', '), [kind, ...args]);
    }
  }
}
