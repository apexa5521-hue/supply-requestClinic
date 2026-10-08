// Google Apps Script services (Sheets, Cache, Properties, Lock, Drive, Mail, Utilities) on top of
// in-memory tables, so Code.gs runs unchanged in Node. Persistence lives in server/store.js.
import crypto from 'node:crypto';

export function createGas({ onMail } = {}) {
  const sheets = {};
  const order = [];
  const files = new Map();       // id → { id, name, mime, bytes:Buffer, saved }
  const props = {};
  const cacheStore = {};

  function Range(sh, row, col, nr = 1, nc = 1) {
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < nr; r++) {
          const line = [];
          for (let c = 0; c < nc; c++) {
            const v = (sh._data[row - 1 + r] || [])[col - 1 + c];
            line.push(v === undefined || v === null ? '' : v);
          }
          out.push(line);
        }
        return out;
      },
      getValue() { return this.getValues()[0][0]; },
      setValues(vals) { for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) sh._set(row + r, col + c, vals[r][c]); return this; },
      setValue(v) { sh._set(row, col, v); return this; },
      setNumberFormat() { return this; },
      setBackground() { return this; },
      setFontWeight() { return this; },
      setDataValidation() { return this; }
    };
  }

  function Sheet(name) {
    return {
      _data: [],
      _name: name,
      _set(r, c, v) {
        while (this._data.length < r) this._data.push([]);
        const line = this._data[r - 1];
        while (line.length < c) line.push('');
        // like Sheets: a leading ' forces text and is not stored
        if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
        line[c - 1] = v;
      },
      getName() { return name; },
      _lr() {
        for (let i = this._data.length; i > 0; i--) if (this._data[i - 1].some(x => x !== '' && x !== null && x !== undefined)) return i;
        return 0;
      },
      _lc() { return this._data.reduce((m, l) => { let n = l.length; while (n && (l[n - 1] === '' || l[n - 1] === undefined)) n--; return Math.max(m, n); }, 0); },
      getLastRow() { return this._lr(); },
      getLastColumn() { return this._lc(); },
      getMaxRows() { return Math.max(this._data.length, 1000); },
      getRange(r, c, nr, nc) { return Range(this, r, c, nr, nc); },
      getDataRange() { return Range(this, 1, 1, Math.max(this._lr(), 1), Math.max(this._lc(), 1)); },
      appendRow(vals) { const r = this._lr() + 1; vals.forEach((v, i) => this._set(r, i + 1, v)); return this; },
      deleteRow(r) { this._data.splice(r - 1, 1); },
      setFrozenRows() { return this; },
      autoResizeColumns() { return this; }
    };
  }

  const ss = {
    getId() { return 'ss1'; },
    getUrl() { return ''; },
    getSheetByName(n) { return sheets[n] || null; },
    insertSheet(n) { sheets[n] = Sheet(n); order.push(n); return sheets[n]; },
    getSheets() { return order.map(n => sheets[n]); },
    deleteSheet(sh) { delete sheets[sh._name]; order.splice(order.indexOf(sh._name), 1); }
  };

  const cache = {
    get(k) { const e = cacheStore[k]; if (!e) return null; if (e.exp < Date.now()) { delete cacheStore[k]; return null; } return e.v; },
    put(k, v, ttl) { cacheStore[k] = { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }; },
    remove(k) { delete cacheStore[k]; },
    removeAll(keys) { keys.forEach(k => delete cacheStore[k]); },
    getAll(keys) { const o = {}; keys.forEach(k => { const v = cache.get(k); if (v !== null) o[k] = v; }); return o; },
    putAll(obj, ttl) { Object.keys(obj).forEach(k => cache.put(k, obj[k], ttl)); }
  };

  // signed bytes, as Apps Script returns them
  const signed = buf => Array.from(buf, b => (b > 127 ? b - 256 : b));
  const unsigned = bytes => Buffer.from(bytes.map(b => b & 0xff));

  function fmt(date, tz, pattern) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(date)).forEach(x => { p[x.type] = x.value; });
    return pattern.replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day)
      .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  }

  const lock = { waitLock() {}, tryLock() { return true; }, releaseLock() {}, hasLock() { return true; } };

  const folder = {
    getId() { return 'folder1'; },
    getUrl() { return ''; },
    addCopy(name) { return { getUrl() { return ''; }, getName() { return name; } }; },
    getFiles() { return { hasNext: () => false, next: () => null }; },
    createFile(blob) {
      const id = crypto.randomUUID();
      files.set(id, { id, name: blob.name || id, mime: blob.type || 'application/octet-stream', bytes: unsigned(blob.bytes), saved: false });
      return { setSharing() { return this; }, getUrl() { return '/files/' + id; }, getId() { return id; } };
    }
  };

  const globals = {
    SpreadsheetApp: { getActiveSpreadsheet() { return ss; }, flush() {}, getUi() { return { alert() {} }; } },
    CacheService: { getScriptCache() { return cache; } },
    LockService: { getScriptLock() { return lock; }, getDocumentLock() { return lock; } },
    PropertiesService: { getScriptProperties() { return {
      getProperty(k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
      setProperty(k, v) { props[k] = String(v); return this; },
      deleteProperty(k) { delete props[k]; return this; },
      getKeys() { return Object.keys(props); },
      getProperties() { return Object.assign({}, props); } }; } },
    MailApp: { sendEmail(to, subject, body) { if (onMail) onMail({ to, subject, body }); }, getRemainingDailyQuota() { return 100; } },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFoldersByName() { return { hasNext() { return true; }, next() { return folder; } }; },
      getFolderById() { return folder; },
      createFolder() { return folder; },
      getFileById(id) {
        if (id === 'ss1') return { makeCopy(name) { return folder.addCopy(name); } };
        const f = files.get(id);
        if (!f) throw new Error('No item with the given ID could be found');
        return { getBlob() { return { getBytes() { return signed(f.bytes); }, getContentType() { return f.mime; } }; }, getUrl() { return '/files/' + id; } };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
      Charset: { UTF_8: 'utf8' },
      computeDigest(alg, str) { return signed(crypto.createHash(alg).update(String(str), 'utf8').digest()); },
      base64Encode(bytes) { return (typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : unsigned(bytes)).toString('base64'); },
      base64Decode(str) { return signed(Buffer.from(String(str), 'base64')); },
      newBlob(bytes, type, name) { return { bytes, type, name, getBytes() { return bytes; } }; },
      getUuid() { return crypto.randomUUID(); },
      formatDate: fmt,
      sleep() {}
    },
    // scheduled triggers (nightly backup, daily digest) are not available here yet
    ScriptApp: {
      getProjectTriggers() { return []; },
      deleteTrigger() {},
      newTrigger() { const b = new Proxy({}, { get: (_, k) => (k === 'create' ? () => ({}) : () => b) }); return b; },
      getService() { return { getUrl() { return ''; } }; },
      WeekDay: {}
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput(s) { return { setMimeType() { return this; }, getContent() { return s; } }; }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutputFromFile() { const o = { setTitle() { return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; }, getContent() { return ''; } }; return o; },
      createTemplateFromFile() { return { evaluate() { return globals.HtmlService.createHtmlOutputFromFile(); } }; }
    }
  };

  return { globals, ss, sheets, order, files, props, cacheStore };
}
