// PostgreSQL persistence for the Apps Script runtime.
// Each sheet row is its own database row (gas_rows), so a save writes only the rows that changed
// (writing whole sheets made every save slower as data grew, and left big dead copies behind).
// gas_sheets keeps the tab list and order. Script properties + small cache entries (sessions, counters)
// are key/value rows, also written only when they change. Drive files: id (or bytes when Drive is off).
import crypto from 'node:crypto';
import { driveAccessToken, uploadDriveFile } from './drive.mjs';

const SCHEMA = `
create table if not exists gas_sheets (name text primary key, ord int not null default 0, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists gas_kv (kind text not null, k text not null, v text not null, exp bigint, primary key (kind, k));
create table if not exists gas_files (id text primary key, name text, mime text, bytes bytea, created_at timestamptz not null default now());
create table if not exists gas_rows (sheet text not null, rn int not null, data text not null, primary key (sheet, rn));
alter table gas_sheets add column if not exists rowstore boolean not null default false;
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
// cache entries bigger than this are memoized sheet reads: rebuilt on demand, never worth a database write
export const CACHE_KEEP_MAX = 4096;

export class Store {
  // drive: { cfg, token?, upload } or null. With Drive set up, new files go to Drive and only the id is kept.
  constructor(pool, drive = null, limitMb = Number(process.env.DB_LIMIT_MB) || 500) {
    this.pool = pool; this.drive = drive; this.limitMb = limitMb;
    this.rows = {};   // sheet → encoded rows as last written (to find the changed ones)
    this.ord = {};    // sheet → position as last written
    this.kv = { prop: new Map(), cache: new Map() }; // key → 'value|exp' as last written
  }

  async init() { await this.pool.query(SCHEMA); }

  async load(gas, DateCtor) {
    const { rows } = await this.pool.query('select name, ord, rowstore, case when rowstore then null else data::text end as data from gas_sheets order by ord, name');
    const stored = await this.pool.query('select sheet, rn, data from gas_rows order by sheet, rn');
    const bySheet = {};
    stored.rows.forEach(r => { (bySheet[r.sheet] = bySheet[r.sheet] || []).push(r); });
    let legacy = 0;
    rows.forEach(r => {
      const sh = gas.ss.insertSheet(r.name);
      if (r.rowstore) {
        const list = bySheet[r.name] || [];
        sh._data = list.map(x => decodeGrid(x.data, DateCtor));
        this.rows[r.name] = list.map(x => x.data);
        this.ord[r.name] = r.ord;
      } else {
        // first start after the upgrade: the whole grid is in gas_sheets.data — the flush below moves it to gas_rows
        sh._data = decodeGrid(r.data, DateCtor);
        legacy++;
      }
    });
    const kv = await this.pool.query('select kind, k, v, exp from gas_kv');
    const now = Date.now();
    kv.rows.forEach(r => {
      if (r.kind === 'prop') { gas.props[r.k] = r.v; this.kv.prop.set(r.k, r.v + '|'); }
      else if (r.kind === 'cache' && Number(r.exp) > now) { gas.cacheStore[r.k] = { v: r.v, exp: Number(r.exp) }; this.kv.cache.set(r.k, r.v + '|' + r.exp); }
      else if (r.kind === 'cache') this.kv.cache.set(r.k, ''); // expired: the next flush deletes it
    });
    const fl = await this.pool.query('select id, name, mime, bytes, drive_id from gas_files');
    // bytes of Drive files are not reloaded at boot; /files/:id redirects to Drive for them
    fl.rows.forEach(f => gas.files.set(f.id, { id: f.id, name: f.name, mime: f.mime, bytes: f.bytes, driveId: f.drive_id || '', saved: true }));
    if (legacy) await this.flush(gas, { migrate: true });
    return { sheets: rows.length, props: Object.keys(gas.props).length, files: fl.rows.length, migrated: legacy };
  }

  /** what changed since the last flush: rows per sheet, tab list, properties, small cache entries */
  diff(gas) {
    const sheets = [], dropped = Object.keys(this.rows).filter(n => !gas.sheets[n]);
    gas.order.forEach((name, i) => {
      const cur = (gas.sheets[name]._data || []).map(r => encodeGrid(r || []));
      const prev = this.rows[name];
      const isNew = !prev;
      const changed = [];
      cur.forEach((t, rn) => { if (isNew || prev[rn] !== t) changed.push(rn); });
      const cut = prev && prev.length > cur.length ? cur.length : -1;
      if (isNew || changed.length || cut !== -1 || this.ord[name] !== i) sheets.push({ name, i, cur, changed, cut, isNew });
    });
    const now = Date.now();
    const kvDiff = (kind, entries) => {
      const seen = new Set(), ups = [], dels = [];
      entries.forEach(([k, v, exp]) => {
        seen.add(k);
        const sig = v + '|' + (exp == null ? '' : exp);
        if (this.kv[kind].get(k) !== sig) ups.push([k, v, exp, sig]);
      });
      this.kv[kind].forEach((sig, k) => { if (!seen.has(k)) dels.push(k); });
      return { ups, dels };
    };
    const props = kvDiff('prop', Object.entries(gas.props).map(([k, v]) => [k, String(v), null]));
    const cache = kvDiff('cache', Object.entries(gas.cacheStore)
      .filter(([, e]) => e.exp > now && String(e.v).length <= CACHE_KEEP_MAX).map(([k, e]) => [k, String(e.v), e.exp]));
    return { sheets, dropped, props, cache };
  }

  // writes everything that changed since the last flush, in one transaction
  async flush(gas, opts = {}) {
    const d = this.diff(gas);
    const newFiles = [...gas.files.values()].filter(f => !f.saved);
    const kvDirty = d.props.ups.length || d.props.dels.length || d.cache.ups.length || d.cache.dels.length;
    if (!d.sheets.length && !d.dropped.length && !kvDirty && !newFiles.length) return 0;
    // data changes (requests, approvals...) stop only when the database is almost full
    if (!opts.migrate && (d.sheets.length || d.dropped.length)) await this.checkTextRoom();
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
    let written = 0;
    try {
      await c.query('begin');
      for (const s of d.sheets) {
        if (s.isNew || this.ord[s.name] !== s.i) {
          await c.query(`insert into gas_sheets (name, ord, data, rowstore, updated_at) values ($1, $2, '[]'::jsonb, true, now())
            on conflict (name) do update set ord = excluded.ord, data = '[]'::jsonb, rowstore = true, updated_at = now()`, [s.name, s.i]);
        }
        if (s.isNew) await c.query('delete from gas_rows where sheet = $1', [s.name]);
        for (let a = 0; a < s.changed.length; a += 500) {
          const part = s.changed.slice(a, a + 500), vals = [], args = [s.name];
          part.forEach((rn, j) => { vals.push(`($1, $${j * 2 + 2}, $${j * 2 + 3})`); args.push(rn, s.cur[rn]); });
          await c.query('insert into gas_rows (sheet, rn, data) values ' + vals.join(', ') + ' on conflict (sheet, rn) do update set data = excluded.data', args);
        }
        if (s.cut !== -1) await c.query('delete from gas_rows where sheet = $1 and rn >= $2', [s.name, s.cut]);
        if (!s.isNew && s.changed.length) await c.query('update gas_sheets set updated_at = now() where name = $1', [s.name]);
        written += s.changed.length + (s.cut !== -1 ? 1 : 0);
      }
      for (const n of d.dropped) {
        await c.query('delete from gas_rows where sheet = $1', [n]);
        await c.query('delete from gas_sheets where name = $1', [n]);
      }
      for (const kind of ['prop', 'cache']) {
        const { ups, dels } = d[kind === 'prop' ? 'props' : 'cache'];
        if (dels.length) await c.query('delete from gas_kv where kind = $1 and k = any($2)', [kind, dels]);
        for (let a = 0; a < ups.length; a += 500) {
          const part = ups.slice(a, a + 500), vals = [], args = [kind];
          part.forEach(([k, v, exp], j) => { vals.push(`($1, $${j * 3 + 2}, $${j * 3 + 3}, $${j * 3 + 4})`); args.push(k, v, exp); });
          await c.query('insert into gas_kv (kind, k, v, exp) values ' + vals.join(', ') + ' on conflict (kind, k) do update set v = excluded.v, exp = excluded.exp', args);
        }
      }
      for (const f of newFiles) {
        // with a Drive id the bytes are not kept in the database
        const bytes = f.driveId ? null : f.bytes;
        await c.query('insert into gas_files (id, name, mime, bytes, drive_id) values ($1, $2, $3, $4, $5) on conflict (id) do nothing', [f.id, f.name, f.mime, bytes, f.driveId || null]);
      }
      await c.query('commit');
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
    // only after the commit: remember what the database now holds
    d.sheets.forEach(s => { this.rows[s.name] = s.cur; this.ord[s.name] = s.i; });
    d.dropped.forEach(n => { delete this.rows[n]; delete this.ord[n]; });
    for (const kind of ['prop', 'cache']) {
      const { ups, dels } = d[kind === 'prop' ? 'props' : 'cache'];
      dels.forEach(k => this.kv[kind].delete(k));
      ups.forEach(([k, , , sig]) => this.kv[kind].set(k, sig));
    }
    newFiles.forEach(f => { f.saved = true; });
    return written + d.dropped.length + (kvDirty ? 1 : 0) + newFiles.length;
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


}
