/** Część kotwicy teczki: małe litery, bez polskich znaków, reszta → '-'. */
export const slug = (s: string): string =>
  s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Kotwice teczek strony klienta (`/p/<token>#<kotwica>`), w kolejności teczek obiektu: zawsze niepuste (`teczka`) i unikalne (`-2`, `-3`…).
 * Ta sama funkcja w serwerze i w naklejce – web podaje te same kategorie w tej samej kolejności (kolejność słownika).
 */
export function anchors(kategorie: string[]): string[] {
  const used = new Set<string>();
  return kategorie.map((k) => {
    const base = slug(k) || 'teczka';
    let a = base;
    for (let n = 2; used.has(a); n++) a = `${base}-${n}`;
    used.add(a);
    return a;
  });
}
