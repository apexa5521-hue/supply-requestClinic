import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

// الدالة الرئيسية: api(token, fn, args)
// تحاكي الواجهة الحالية من Code.gs
app.post('/api', async (req, res) => {
  try {
    const { token, fn, args } = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    if (!fn) {
      return res.status(400).json({ error: 'Missing function name' });
    }

    // TODO: تحقق من الـ token والصلاحيات
    // TODO: استدعِ الدالة المناسبة

    res.status(501).json({ error: 'Not implemented yet' });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  let db;
  try {
    const r = await pool.query('select version()');
    db = { connected: true, version: r.rows[0].version.split(' ').slice(0, 2).join(' ') };
  } catch (err) {
    db = { connected: false, error: err.message };
  }
  res.json({ status: 'ok', db, timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SupplyFlow API listening on port ${PORT}`);
});
