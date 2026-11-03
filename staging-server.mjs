// Isolated Masar staging entrypoint. This intentionally does NOT start the production Masar app.
// Safe until a dedicated staging database connection is configured.
import http from 'node:http';
import pg from 'pg';
const port = Number(process.env.PORT || 10000);
const url = process.env.STAGING_DATABASE_URL || '';
const productionRef = 'gqxrfqrfsnjqmqaaspfa';
if (process.env.MASAR_STAGING_ONLY !== 'true') throw new Error('STAGING_ONLY_REQUIRED');
if (url && (url.includes(productionRef) || /masar.production/i.test(url))) throw new Error('PRODUCTION_DB_REFUSED');
const pool = url ? new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 4000, ssl: { rejectUnauthorized: false } }) : null;
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.url !== '/health') { res.writeHead(404); return res.end(JSON.stringify({ error: 'STAGING_ONLY' })); }
  if (!pool) { res.writeHead(503); return res.end(JSON.stringify({ environment: 'isolated-staging', database: 'not-configured', testReady: false })); }
  try {
    await pool.query('select 1');
    res.writeHead(200);
    res.end(JSON.stringify({ environment: 'isolated-staging', database: 'connected', testReady: false, note: 'tenant-isolation-testing-not-yet-implemented' }));
  } catch {
    res.writeHead(503);
    res.end(JSON.stringify({ environment: 'isolated-staging', database: 'not-connected', testReady: false }));
  }
});
server.listen(port, '0.0.0.0');
