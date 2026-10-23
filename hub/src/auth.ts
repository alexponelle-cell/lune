import { createHmac, timingSafeEqual } from 'node:crypto';

/** Session signée (cookie) : `<expiration>.<signature>`. Pas de base de sessions à gérer. */
const DAYS = 30;
const sign = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function makeSession(secret: string, now = Date.now()): string {
  const exp = String(now + DAYS * 86_400_000);
  return `${exp}.${sign(secret, exp)}`;
}

export function checkSession(secret: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < now) return false;
  const good = Buffer.from(sign(secret, exp)), got = Buffer.from(sig);
  return good.length === got.length && timingSafeEqual(good, got);
}

export function samePassword(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
