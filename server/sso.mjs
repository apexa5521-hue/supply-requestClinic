// Single sign-on from the operations platform (apexcare-platform).
// The platform signs a one-minute, single-use ticket (an ES256 JWT) with its organization's private key and
// opens Masar at /#sso=<ticket>. Here the ticket is checked with the platform's public key (SSO_PUBLIC_KEY,
// not a secret); when it checks out, the user named in it gets an ordinary session, as if they had typed their
// password. The name/password login is untouched.
import crypto from 'node:crypto';

export const ISSUER = 'apexcare-platform';
const MAX_TICKET_SECONDS = 120;
const CLOCK_TOLERANCE = 30;

/** A PEM public key pasted into an environment variable: real line breaks, or written as \n. */
export function readPublicKey(value) {
  const v = String(value || '').trim().replace(/\\n/g, '\n');
  if (!v.includes('BEGIN PUBLIC KEY')) return null;
  try { return crypto.createPublicKey(v); } catch (e) { return null; }
}

/** Ticket ids already used, kept until the ticket would have expired anyway: each ticket works once. */
export class UsedTickets {
  constructor(now = () => Date.now()) { this.ids = new Map(); this.now = now; }
  claim(jti, expSeconds) {
    const t = this.now();
    for (const [k, exp] of this.ids) if (exp < t) this.ids.delete(k);
    if (this.ids.has(jti)) return false;
    this.ids.set(jti, expSeconds * 1000);
    return true;
  }
}

const b64json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/**
 * The ticket's claims, or null when it is not one Masar should accept: not ES256, bad signature, wrong
 * issuer or audience, expired or not yet valid, issued for longer than MAX_TICKET_SECONDS, without a
 * user name or id, or already used.
 */
export function verifyTicket(ticket, { key, audience, used, now = Date.now() }) {
  if (!key || typeof ticket !== 'string' || ticket.length > 4096) return null;
  const parts = ticket.split('.');
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
  let header, claims;
  try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch (e) { return null; }
  // only ES256: refuses "none" and HS256 tokens made with the public key as their secret
  if (!header || header.alg !== 'ES256') return null;
  const sig = Buffer.from(parts[2], 'base64url');
  if (sig.length !== 64) return null;
  const ok = crypto.verify('sha256', Buffer.from(parts[0] + '.' + parts[1]), { key, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok || !claims || typeof claims !== 'object') return null;
  const sec = Math.floor(now / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !aud.includes(audience)) return null;
  if (!Number.isFinite(claims.exp) || !Number.isFinite(claims.iat)) return null;
  if (claims.exp + CLOCK_TOLERANCE < sec || claims.iat - CLOCK_TOLERANCE > sec) return null;
  if (claims.exp - claims.iat > MAX_TICKET_SECONDS) return null;
  if (typeof claims.sub !== 'string' || !claims.sub.trim() || typeof claims.jti !== 'string' || !claims.jti) return null;
  if (!used.claim(claims.jti, claims.exp)) return null;
  return claims;
}
