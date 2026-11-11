/** Bez znaków mylących się przy przepisywaniu z ekranu: 0/O/o, 1/l/I. */
export const PASSWORD_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Hasło startowe: 12 znaków z crypto.getRandomValues (odrzucanie nadmiaru, bez przechyłu modulo). */
export function genPassword(len = 12): string {
  const n = PASSWORD_CHARS.length;
  const limit = 256 - (256 % n);
  let out = '';
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < limit && out.length < len) out += PASSWORD_CHARS[b % n];
    }
  }
  return out;
}

/** Nowa kolejność po przesunięciu elementu o `dir` (−1 w górę, +1 w dół); poza zakresem bez zmian. */
export function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}
