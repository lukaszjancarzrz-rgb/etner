import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;

/** `scrypt$<sól base64>$<skrót base64>`, losowa 16-bajtowa sól. */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, KEY_LEN).toString('base64')}`;
}

export function verifyPassword(pw: string, stored: string | null | undefined): boolean {
  const [alg, salt, hash] = (stored ?? '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = scryptSync(pw, Buffer.from(salt, 'base64'), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

const DUMMY = hashPassword('nieistniejące-konto');
/** Brak konta też kosztuje jedno scrypt, więc czas odpowiedzi nie zdradza, czy login istnieje. */
export const dummyVerify = (pw: string): false => (verifyPassword(pw, DUMMY), false);
