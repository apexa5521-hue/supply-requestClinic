import assert from 'node:assert/strict';
import pg from 'pg';
import { storageState, Store, StorageFullError } from './store.mjs';
import { createGas } from './gas.mjs';

const MB = 1048576;
assert.equal(storageState(100 * MB, 500).photosBlocked, false);
assert.equal(storageState(399 * MB, 500).photosBlocked, false, 'below 80% photos still go to the database');
assert.equal(storageState(400 * MB, 500).photosBlocked, true, 'photos stop at 80%');
assert.equal(storageState(400 * MB, 500).textBlocked, false, 'text keeps working at 80%');
assert.equal(storageState(485 * MB, 500).textBlocked, true, 'everything stops at 97%');
assert.equal(storageState(250 * MB, 500).percent, 50);

// real database: with the limit set below the current size, a photo kept in the database is refused and nothing is written
if (process.env.DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const gas = createGas({});
  const store = new Store(pool, null, 1); // 1 MB limit: the database is already bigger
  await store.init();
  gas.files.set('p1', { id: 'p1', name: 'photo.jpg', mime: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]), driveId: '', saved: false });
  await assert.rejects(store.flush(gas), e => e instanceof StorageFullError && e.code === 'ERR_STORAGE_FULL');
  const { rows } = await pool.query("select count(*)::int as n from gas_files where id = 'p1'");
  assert.equal(rows[0].n, 0, 'the refused photo was not written');
  await pool.end();
  console.log('store DB test OK');
} else {
  console.log('store DB test skipped (no DATABASE_URL)');
}
console.log('storage guard tests OK');
