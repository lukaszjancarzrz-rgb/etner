import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;
/** Asynchroniczny scrypt (pula wątków libuv), żeby logowania nie blokowały pętli zdarzeń. */
const derive = (pw: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, len, (e, k) => (e ? rej(e) : res(k))));

export const MAX_PASSWORD = 200;

/** `scrypt$<sól base64>$<skrót base64>`, losowa 16-bajtowa sól. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await derive(pw, salt, KEY_LEN)).toString('base64')}`;
}

const DUMMY = await hashPassword('nieistniejące-konto');

/** Brak skrótu (null, uszkodzony) lub konta też kosztuje jedno scrypt, więc czas odpowiedzi nic nie zdradza. */
export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  const [alg, salt, hash] = (stored ?? '').split('$');
  const ok = alg === 'scrypt' && !!salt && !!hash;
  const want = Buffer.from(ok ? hash! : DUMMY.split('$')[2]!, 'base64');
  const got = await derive(pw, Buffer.from(ok ? salt! : DUMMY.split('$')[1]!, 'base64'), want.length);
  return ok && got.length === want.length && timingSafeEqual(got, want);
}

/** Konto nie istnieje: ten sam koszt co przy sprawdzaniu hasła. */
export const dummyVerify = (pw: string): Promise<false> => verifyPassword(pw, null).then(() => false as const);
