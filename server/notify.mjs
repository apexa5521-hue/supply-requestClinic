// Outgoing notifications for Code.gs on Render: email over SMTP (MailApp) and phone push (Web Push).
// Code.gs runs synchronously, so both only queue here; sending happens in the background and a
// failure is logged, never thrown back into the request that caused it.
import nodemailer from 'nodemailer';
import webpush from 'web-push';

/* ---------- email: SMTP_USER + SMTP_PASS (Gmail: an App Password) ---------- */
export function mailConfigFromEnv(env) {
  const user = String(env.SMTP_USER || '').trim(), pass = String(env.SMTP_PASS || '').replace(/\s+/g, '');
  if (!user || !pass) return null;
  const port = Number(env.SMTP_PORT) || 465;
  return { host: String(env.SMTP_HOST || 'smtp.gmail.com').trim(), port, secure: port === 465, user, pass,
    from: String(env.MAIL_FROM || user).trim() };
}

export function createMailer(cfg, { transport, log = console } = {}) {
  const tx = cfg ? (transport || nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.pass },
    pool: true, maxConnections: 2 })) : null;
  let sent = 0, failed = 0;
  return {
    enabled: !!tx,
    stats: () => ({ sent, failed }),
    // m = { to: 'a@x, b@y', subject, body (text), html, name } — the same arguments as MailApp.sendEmail
    send(m) {
      const to = String(m.to || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!to.length) return Promise.resolve(false);
      if (!tx) { log.log('[mail] (SMTP not set) to=%s subject=%s', to.join(','), m.subject); return Promise.resolve(false); }
      const name = String(m.name || '').replace(/["\r\n]/g, '');
      // several recipients (a role, a department): each sees only their own address
      const msg = { from: name ? `"${name}" <${cfg.from}>` : cfg.from, subject: m.subject, text: m.body || '', ...(m.html ? { html: m.html } : {}) };
      if (to.length === 1) msg.to = to[0]; else { msg.to = cfg.from; msg.bcc = to; }
      return tx.sendMail(msg).then(() => { sent++; return true; }, e => { failed++; log.error('[mail] failed to=%s subject=%s: %s', to.join(','), m.subject, e.message); return false; });
    }
  };
}

/* ---------- phone push: VAPID keys from env, or generated once and kept in the database ---------- */
export function createPusher(keys, { onGone, log = console, send = webpush.sendNotification.bind(webpush) } = {}) {
  if (!keys || !keys.publicKey || !keys.privateKey) return null;
  const details = { subject: keys.subject || 'mailto:admin@masarx.app', publicKey: keys.publicKey, privateKey: keys.privateKey };
  return {
    publicKey: keys.publicKey,
    // subs = [{ endpoint, keys: { p256dh, auth } }], payload = JSON text { title, body, url, tag }
    async send(subs, payload) {
      const gone = [];
      await Promise.all((subs || []).map(s => send(s, payload, { vapidDetails: details, TTL: 24 * 3600, urgency: 'high' })
        .catch(e => {
          // 404/410: the person turned notifications off or removed the app — forget that device
          if (e && (e.statusCode === 404 || e.statusCode === 410)) gone.push(s.endpoint);
          else log.error('[push] failed (%s): %s', e && e.statusCode, e && e.message);
        })));
      if (gone.length && onGone) await onGone(gone);
      return gone;
    }
  };
}

export function vapidFromEnv(env) {
  const publicKey = String(env.VAPID_PUBLIC_KEY || '').trim(), privateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  return publicKey && privateKey ? { publicKey, privateKey, subject: String(env.VAPID_SUBJECT || '').trim() } : null;
}
/** keys from env, else the pair stored in gas_kv (created on first boot) — push works with no setup */
export async function loadVapid(pool, env) {
  const fromEnv = vapidFromEnv(env);
  const subject = String(env.VAPID_SUBJECT || '').trim() || (env.SMTP_USER ? 'mailto:' + String(env.SMTP_USER).trim() : '');
  if (fromEnv) return { ...fromEnv, subject: fromEnv.subject || subject };
  const r = await pool.query("select v from gas_kv where kind = 'meta' and k = 'vapid'");
  if (r.rows[0]) return { ...JSON.parse(r.rows[0].v), subject };
  const k = webpush.generateVAPIDKeys();
  await pool.query("insert into gas_kv (kind, k, v) values ('meta', 'vapid', $1) on conflict (kind, k) do nothing", [JSON.stringify(k)]);
  const again = await pool.query("select v from gas_kv where kind = 'meta' and k = 'vapid'");
  return { ...JSON.parse(again.rows[0].v), subject };
}

/* ---------- what the phone needs: service worker + manifest ---------- */
export const SERVICE_WORKER = `// MasarX: phone notifications (tap opens the request)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'MasarX · مسار اكس', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, dir: 'auto',
    icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  const req = url.searchParams.get('req');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const w = list.find(c => new URL(c.url).origin === url.origin);
    if (w) { if (req) w.postMessage({ req }); return w.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
`;

export const MANIFEST = JSON.stringify({
  name: 'MasarX · مسار اكس', short_name: 'مسار اكس', id: '/', start_url: '/', scope: '/', display: 'standalone',
  dir: 'rtl', lang: 'ar', background_color: '#eef3f6', theme_color: '#3d8fc8',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
  ]
});

export const HEAD_TAGS = [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<meta name="theme-color" content="#3d8fc8">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="مسار اكس">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">'
].join('\n');
