import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { storageState, Store, StorageFullError, CACHE_KEEP_MAX } from './store.mjs';
import { createGas } from './gas.mjs';

const MB = 1048576;
assert.equal(storageState(399 * MB, 500).photosBlocked, false, 'below 80% photos still go to the database');
assert.equal(storageState(400 * MB, 500).photosBlocked, true, 'photos stop at 80%');
assert.equal(storageState(400 * MB, 500).textBlocked, false, 'text keeps working at 80%');
assert.equal(storageState(485 * MB, 500).textBlocked, true, 'everything stops at 97%');
// the routes the plan depends on must stay in the server (one was lost once in a refactor)
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
['/sync/run', '/admin', '/admin/export', '/admin/import', '/admin/status', '/health', '/api'].forEach(r =>
  assert.ok(server.includes("'" + r + "'"), 'route ' + r + ' exists'));

// real database tests run in their own schema (created and dropped here), never in the app's tables
if (process.env.DATABASE_URL) {
  const schema = 'storetest_' + process.pid;
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query('create schema ' + schema);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: '-c search_path=' + schema });
  const q = async (sql, args) => (await pool.query(sql, args)).rows;
  try {
    const st = new Store(pool, null, 500);
    await st.init();
    // 1) upgrade: a sheet stored the old way (whole grid in gas_sheets.data) moves to gas_rows on load
    await q(`insert into gas_sheets (name, ord, data) values ('Requests', 0, $1::jsonb)`,
      [JSON.stringify([['RequestID', 'Date'], ['REQ-1', { $d: '2026-01-01T07:00:00.000Z' }], ['REQ-2', '']])]);
    const g1 = createGas({});
    const loaded = await st.load(g1, Date);
    assert.equal(loaded.migrated, 1);
    assert.equal(g1.sheets.Requests._data[1][1].toISOString(), '2026-01-01T07:00:00.000Z', 'dates revived');
    assert.deepEqual((await q('select rn from gas_rows where sheet = $1 order by rn', ['Requests'])).map(r => r.rn), [0, 1, 2]);
    const meta = (await q("select rowstore, data::text as d from gas_sheets where name = 'Requests'"))[0];
    assert.deepEqual([meta.rowstore, meta.d], [true, '[]'], 'old grid cleared after the move');

    // 2) a save writes only the changed row (xmin = the transaction that last wrote the row)
    const xmin = async () => Object.fromEntries((await q("select rn, xmin::text as x from gas_rows where sheet = 'Requests'")).map(r => [r.rn, r.x]));
    const before = await xmin();
    g1.sheets.Requests._data[2][1] = new Date('2026-02-02T08:00:00Z');
    assert.equal(await st.flush(g1), 1);
    const after = await xmin();
    assert.equal(after[0], before[0]); assert.equal(after[1], before[1]); assert.notEqual(after[2], before[2]);
    assert.equal(await st.flush(g1), 0, 'nothing changed → nothing written');

    // 3) append, then delete rows from the end
    g1.sheets.Requests._data.push(['REQ-3', ''], ['REQ-4', '']);
    assert.equal(await st.flush(g1), 2);
    g1.sheets.Requests._data.splice(3, 2);
    await st.flush(g1);
    assert.equal((await q("select count(*)::int as n from gas_rows where sheet = 'Requests'"))[0].n, 3);

    // 4) cache: small entries (sessions) are kept, big memoized reads are not; removed keys are deleted
    g1.cacheStore['s:tok'] = { v: 'user', exp: Date.now() + 60000 };
    g1.cacheStore['memo:big'] = { v: 'x'.repeat(CACHE_KEEP_MAX + 1), exp: Date.now() + 60000 };
    g1.props.backup = 'x';
    await st.flush(g1);
    assert.deepEqual((await q("select kind, k from gas_kv order by kind, k")).map(r => r.kind + ':' + r.k), ['cache:s:tok', 'prop:backup']);
    delete g1.cacheStore['s:tok'];
    await st.flush(g1);
    assert.deepEqual((await q("select k from gas_kv where kind = 'cache'")).length, 0);

    // 5) a new tab, a dropped tab, and a fresh load gives back exactly the same data
    g1.ss.insertSheet('Log')._data = [['Timestamp', 'Action'], [new Date('2026-03-03T09:00:00Z'), 'x']];
    await st.flush(g1);
    g1.ss.deleteSheet(g1.sheets.Log);
    await st.flush(g1);
    assert.equal((await q("select count(*)::int as n from gas_rows where sheet = 'Log'"))[0].n, 0);
    const g2 = createGas({});
    await new Store(pool, null, 500).load(g2, Date);
    assert.deepEqual(g2.order, ['Requests']);
    assert.deepEqual(JSON.stringify(g2.sheets.Requests._data), JSON.stringify(g1.sheets.Requests._data));
    assert.equal(g2.props.backup, 'x');

    // 6) storage guard: over the limit, a photo kept in the database is refused and nothing is written
    const tiny = new Store(pool, null, 1);
    const g3 = createGas({});
    await tiny.load(g3, Date);
    g3.files.set('p1', { id: 'p1', name: 'photo.jpg', mime: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]), driveId: '', saved: false });
    await assert.rejects(tiny.flush(g3), e => e instanceof StorageFullError && e.code === 'ERR_STORAGE_FULL');
    assert.equal((await q("select count(*)::int as n from gas_files"))[0].n, 0);
    console.log('store DB tests OK');
  } finally {
    await pool.end();
    await admin.query('drop schema ' + schema + ' cascade');
    await admin.end();
  }
} else {
  console.log('store DB tests skipped (no DATABASE_URL)');
}
console.log('store tests OK');
