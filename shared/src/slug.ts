/** Kotwica teczki na stronie klienta (`/p/<token>#<slug>`): małe litery, bez polskich znaków, reszta → '-'. Ta sama funkcja w serwerze i w naklejce. */
export const slug = (s: string): string =>
  s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
