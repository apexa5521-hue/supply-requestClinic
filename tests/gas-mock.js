/**
 * محاكي بسيط لخدمات Google Apps Script (Spreadsheet, Cache, Lock, Drive, Mail, Utilities)
 * لتشغيل Code.gs محلياً في Node أو داخل المتصفح أثناء الاختبارات.
 * يعمل في المتصفح (window.GasMock) وفي Node (module.exports).
 */
(function (root) {
  function createGas(opts) {
    opts = opts || {};
    const sheets = {};
    const order = [];
    const mails = [];
    const files = [];
    const forcedText = [];
    let uuidSeq = 0;

    function Range(sh, row, col, nr, nc) {
      nr = nr || 1; nc = nc || 1;
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
        setValues(vals) {
          for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) sh._set(row + r, col + c, vals[r][c]);
          return this;
        },
        setValue(v) { sh._set(row, col, v); return this; },
        setFontWeight() { return this; }
      };
    }

    function Sheet(name) {
      const sh = {
        _data: [],
        _name: name,
        _set(r, c, v) {
          while (this._data.length < r) this._data.push([]);
          const line = this._data[r - 1];
          while (line.length < c) line.push('');
          // مثل Sheets: البادئة ' تجبر النص وتختفي عند القراءة — نسجّلها للتحقق من منع حقن الصيغ
          if (typeof v === 'string' && v.charAt(0) === "'") { v = v.slice(1); forcedText.push(v); }
          line[c - 1] = v;
        },
        getName() { return name; },
        getLastRow() {
          for (let i = this._data.length; i > 0; i--) if (this._data[i - 1].some(x => x !== '' && x !== null && x !== undefined)) return i;
          return 0;
        },
        getLastColumn() { return this._data.reduce((m, l) => { let n = l.length; while (n && (l[n - 1] === '' || l[n - 1] === undefined)) n--; return Math.max(m, n); }, 0); },
        getRange(r, c, nr, nc) { return Range(this, r, c, nr, nc); },
        getDataRange() { return Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); },
        appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this._set(r, i + 1, v)); return this; },
        deleteRow(r) { this._data.splice(r - 1, 1); },
        setFrozenRows() { return this; },
        autoResizeColumns() { return this; }
      };
      return sh;
    }

    const ss = {
      getSheetByName(n) { return sheets[n] || null; },
      insertSheet(n) { sheets[n] = Sheet(n); order.push(n); return sheets[n]; },
      getSheets() { return order.map(n => sheets[n]); },
      deleteSheet(sh) { delete sheets[sh._name]; order.splice(order.indexOf(sh._name), 1); }
    };

    const cacheStore = {};
    const now = () => (opts.now ? opts.now() : Date.now());
    const cache = {
      get(k) { const e = cacheStore[k]; if (!e) return null; if (e.exp < now()) { delete cacheStore[k]; return null; } return e.v; },
      put(k, v, ttl) { cacheStore[k] = { v: String(v), exp: now() + (ttl || 600) * 1000 }; },
      remove(k) { delete cacheStore[k]; }
    };

    function digestBytes(str, len) {
      if (opts.digest) return opts.digest(str, len);
      // FNV-1a مكرر — كافٍ للاختبار (ليس تشفيراً حقيقياً)
      const out = [];
      let h = 0x811c9dc5;
      for (let round = 0; out.length < len; round++) {
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i) + round; h = Math.imul(h, 16777619) >>> 0; }
        out.push((h & 0xff) - 128, ((h >>> 8) & 0xff) - 128, ((h >>> 16) & 0xff) - 128, ((h >>> 24) & 0xff) - 128);
      }
      return out.slice(0, len);
    }

    function fmt(date, tz, pattern) {
      const p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(date).forEach(x => { p[x.type] = x.value; });
      return pattern.replace('yyyy', p.year).replace('yy', p.year.slice(2)).replace('MM', p.month).replace('dd', p.day)
        .replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
    }

    const b64 = {
      enc(bytes) {
        const s = bytes.map(b => String.fromCharCode(b & 0xff)).join('');
        return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
      },
      dec(str) {
        const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
        return Array.from(s).map(c => c.charCodeAt(0));
      }
    };

    const globals = {
      SpreadsheetApp: {
        getActiveSpreadsheet() { return ss; },
        getUi() { return { alert() {} }; }
      },
      CacheService: { getScriptCache() { return cache; } },
      LockService: { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } },
      MailApp: { sendEmail(to, subject, body) { mails.push({ to, subject, body }); } },
      DriveApp: {
        Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
        Permission: { VIEW: 'VIEW' },
        getFoldersByName() { return { hasNext() { return false; } }; },
        createFolder(name) {
          return {
            createFile(blob) {
              const id = 'file' + (files.length + 1);
              files.push({ id, name: blob.name, size: blob.bytes.length });
              return { setSharing() {}, getUrl() { return 'https://drive.example/' + id; } };
            }
          };
        }
      },
      Utilities: {
        DigestAlgorithm: { SHA_256: 32, MD5: 16 },
        Charset: { UTF_8: 'UTF-8' },
        computeDigest(alg, str) { return digestBytes(String(str), alg); },
        base64Encode(bytes) { return b64.enc(bytes); },
        base64Decode(str) { return b64.dec(str); },
        newBlob(bytes, type, name) { return { bytes, type, name }; },
        getUuid() {
          uuidSeq++;
          const hex = n => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
          return hex(8) + '-' + hex(4) + '-4' + hex(3) + '-a' + hex(3) + '-' + hex(12);
        },
        formatDate: fmt
      },
      ContentService: {
        MimeType: { JSON: 'json' },
        createTextOutput(s) { return { _s: s, setMimeType() { return this; }, getContent() { return s; } }; }
      },
      HtmlService: {
        XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
        createHtmlOutputFromFile() { const o = { setTitle() { return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; } }; return o; }
      },
      console: typeof console !== 'undefined' ? console : { log() {}, error() {} }
    };

    /** يملأ تبويباً بصف عناوين + صفوف */
    function seed(name, headers, rows) {
      const sh = sheets[name] || ss.insertSheet(name);
      sh._data = [headers.slice()].concat((rows || []).map(r => r.slice()));
      return sh;
    }
    function dump(name) { return sheets[name] ? sheets[name]._data.map(r => r.slice()) : null; }

    return { globals, seed, dump, mails, files, forcedText, cache: cacheStore, ss };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createGas };
  else root.GasMock = { createGas };
})(typeof window !== 'undefined' ? window : globalThis);
