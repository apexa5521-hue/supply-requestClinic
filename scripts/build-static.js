/* يبني نسخة الاستضافة الخارجية: dist/index.html (الواجهة كاملة في ملف واحد) + ملفات إعداد الخادم + zip
   التشغيل: node scripts/build-static.js [رابط Web App الجديد]
   (بدون وسيط يستخدم APPS_SCRIPT_URL الموجود في JavaScript.html) */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'dist');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let js = read('JavaScript.html');
const url = process.argv[2];
if (url) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) { console.error('رابط Web App غير صالح (يجب أن ينتهي بـ /exec)'); process.exit(1); }
  js = js.replace(/const APPS_SCRIPT_URL = '[^']*';/, "const APPS_SCRIPT_URL = '" + url + "';");
}
const used = (js.match(/const APPS_SCRIPT_URL = '([^']*)'/) || [])[1];
let html = read('Index.html');
if (html.indexOf("<?!= include_('JavaScript'); ?>") === -1) { console.error('لم أجد مكان تضمين JavaScript في Index.html'); process.exit(1); }
html = html.replace("<?!= include_('JavaScript'); ?>", () => js);
if (/<\?!?=/.test(html)) { console.error('بقيت وسوم Apps Script في الصفحة'); process.exit(1); }
if (!/<title>/i.test(html)) html = html.replace('<head>', '<head>\n<title>مسار — ApexCare</title>');
if (!/name="viewport"/.test(html)) html = html.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);

/* Apache / LiteSpeed (cPanel): ضغط + كاش + HTTPS */
fs.writeFileSync(path.join(OUT, '.htaccess'), `# مسار — إعداد الخادم
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>
<IfModule mod_headers.c>
  # الصفحة لا تُكاش طويلاً حتى يصل أي تحديث فوراً
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  Header set X-Content-Type-Options "nosniff"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
DirectoryIndex index.html
`);
/* Nginx */
fs.writeFileSync(path.join(OUT, 'nginx.conf.example'), `# ضعه داخل server { } للدومين الفرعي (مع شهادة HTTPS)
root /var/www/masar;
index index.html;
gzip on;
gzip_types text/html text/css application/javascript application/json image/svg+xml;
gzip_min_length 1024;
location = /index.html { add_header Cache-Control "no-cache"; }
location / { try_files $uri /index.html; }
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
`);
fs.writeFileSync(path.join(OUT, 'README.txt'), `نسخة الاستضافة الخارجية — مسار
================================
1) ارفع محتوى هذا المجلد كما هو (index.html و .htaccess) إلى مجلد الدومين الفرعي (public_html/اسم-الدومين-الفرعي).
   - الملف .htaccess مخفي: فعّل "Show hidden files" في مدير الملفات.
   - Nginx: استخدم nginx.conf.example.
2) تأكد أن الدومين الفرعي عليه شهادة HTTPS.
3) افتح https://الدومين-الفرعي — يجب أن تظهر شاشة الدخول.
الخادم والبيانات يبقون في Google Apps Script + Sheets: رابط الخادم داخل الصفحة:
${used}
لا تنسَ: Apps Script ← Deploy ← Who has access = Anyone.
عند أي تحديث للكود: أعد بناء الحزمة وارفع index.html فقط.
`);

/* zip بدون مكتبات خارجية */
const zlib = require('zlib');
const files = fs.readdirSync(OUT).filter(f => fs.statSync(path.join(OUT, f)).isFile());
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const parts = [], central = []; let off = 0;
files.forEach(f => {
  const data = fs.readFileSync(path.join(OUT, f)), def = zlib.deflateRawSync(data, { level: 9 }), name = Buffer.from(f), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(def.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  parts.push(lh, name, def);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(def.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
  central.push(ch, name); off += 30 + name.length + def.length;
});
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
fs.writeFileSync(path.join(ROOT, 'masar-web.zip'), Buffer.concat(parts.concat([cd, end])));
console.log('تم: dist/ + masar-web.zip  (' + (html.length / 1024).toFixed(0) + ' KB) — الخادم: ' + used);
