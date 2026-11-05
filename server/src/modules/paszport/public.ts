import { getConnInfo } from '@hono/node-server/conninfo';
import { anchors, dayOf, type Firma } from '@etner/shared';
import type { Context, Hono } from 'hono';
import type { AppDeps } from '../../app.js';
import * as klienci from '../klienci/service.js';
import * as svc from './service.js';

/** Strona klienta `/p/<token>` (P7, makieta 5): prosty HTML z serwera, bez skryptów (CSP w app.ts), bez logowania. */

const LIMIT = 60, WINDOW = 60_000, MAX_KEYS = 5000, FILE_TTL = 3600;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c]!);
const pl = (d: string) => d.split('-').reverse().join('.');

/**
 * Adres klienta: nagłówek Cloudflare przed Render (nadpisywany przez Cloudflare), inaczej ostatni wpis X-Forwarded-For
 * (dopisany przez proxy; wcześniejsze podaje sam klient), inaczej gniazdo. Bez Cloudflare podrobiony nagłówek
 * pozwala tylko obejść limit (tokeny i tak nie do zgadnięcia), nie zablokować innych.
 */
function clientIp(c: Context): string {
  const fwd = c.req.header('cf-connecting-ip')?.trim() || c.req.header('x-forwarded-for')?.split(',').pop()?.trim();
  if (fwd) return fwd;
  try { return getConnInfo(c).remote.address ?? '?'; } catch { return '?'; }
}

const CSS = `:root{--bg:#eef2f4;--card:#fff;--ink:#0a2240;--mut:#4a5d70;--line:#d3dce5;--acc:#13808f;--warn:#a85d00;--plate:#0a2240;--plate-ink:#fff;--plate-mut:#b9c8d6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:680px;margin:0 auto;padding:12px 16px 32px}a{color:var(--acc)}h1,h2,h3,p{margin:0}
header{display:flex;align-items:center;flex-wrap:wrap;gap:6px 16px;padding:4px 0 14px}header img{height:64px;width:auto;flex:none}
header strong{display:block;font-size:1.6rem;font-weight:800;line-height:1.15}header a{font-size:.95rem}
.plate{background:var(--plate);color:var(--plate-ink);border-radius:14px;padding:16px;display:grid;gap:12px}
.plate .top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.plate .lbl{color:var(--plate-mut);font-size:.85rem}.plate .no{font-size:1.5rem;font-weight:800}
.plate h1{font-size:1.5rem;line-height:1.2}.plate .addr{color:var(--plate-mut)}
.next{border-top:1px solid rgba(255,255,255,.18);padding-top:12px;display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}
.next b{font-size:1.15rem}.next.late b{color:#ffb85c}
.btns{display:flex;flex-wrap:wrap;gap:8px}.btn{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:10px;background:#fff;color:var(--plate);text-decoration:none;font-weight:700}
.btn.sec{background:transparent;color:var(--plate-ink);border:1px solid rgba(255,255,255,.45)}
nav{display:flex;gap:6px;overflow-x:auto;padding:12px 0 2px}nav a{flex:none;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none;font-size:.9rem;font-weight:600}
.sheet{background:var(--card);border:1px solid var(--line);border-radius:14px;margin-top:12px}
section{padding:14px 16px;border-top:1px solid var(--line);scroll-margin-top:8px}section:first-child{border-top:0}
.fh{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap}h2{font-size:1.2rem;font-weight:800}
.fh span{font-size:.9rem;color:var(--mut)}.fh b{color:var(--ink)}.fh .late b{color:var(--warn)}
h3{font-size:.8rem;font-weight:700;color:var(--mut);margin:12px 0 4px}
.rows{list-style:none;margin:0;padding:0}.rows>li{padding:5px 0;border-top:1px solid var(--line)}.rows>li:first-child{border-top:0}
.dev b{font-weight:700}.dev .m{color:var(--mut);font-size:.9rem}
.entries>li{display:grid;grid-template-columns:5.6em 1fr;gap:8px;font-size:.9rem}.entries time{font-weight:700}
.docs{display:flex;flex-wrap:wrap;gap:6px}.docs a{padding:4px 10px;border:1px solid var(--line);border-radius:8px;font-size:.9rem;text-decoration:none}
.ph{display:grid;grid-template-columns:repeat(4,minmax(0,112px));gap:6px}.ph img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;display:block}
.sw{position:fixed;top:0;left:0;opacity:0;width:1px;height:1px;pointer-events:none}.tile,.plus{cursor:pointer}.rest{display:none;margin-top:6px}.more:checked+.ph .plus{display:none}.more:checked+.ph+.rest{display:grid}
.plus{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:8px;background:var(--line);font-size:1.3rem;font-weight:800}
.empty{color:var(--mut);font-size:.9rem}
.lb{display:none;position:fixed;inset:0;z-index:9;background:rgba(5,15,30,.92);align-items:center;justify-content:center;padding:16px}.sw:checked+.lb{display:flex}.sw:focus-visible+.lb .x,.more:focus-visible+.ph .plus{outline:3px solid var(--acc)}
.lb .x{position:absolute;inset:0}.lb figure{position:relative;margin:0;max-width:100%;display:grid;gap:10px;justify-items:center}
.lb img{max-width:100%;max-height:80vh;border-radius:8px;display:block}.lb figcaption{display:flex;gap:10px}.lb figcaption a,.lb figcaption label{cursor:pointer;color:#fff;padding:8px 14px;border:1px solid rgba(255,255,255,.5);border-radius:10px;text-decoration:none;font-weight:700}
footer{color:var(--mut);font-size:.85rem;padding:16px 4px 0}
a:focus-visible,summary:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}`;

const doc = (title: string, body: string) => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`;

const www = (f: Firma) => (f.www ? `<a href="https://${esc(f.www.replace(/^https?:\/\//, ''))}" rel="noopener">${esc(f.www)}</a>` : '');
const head = (f: Firma) => `<header><img src="/logo.png" alt="ETNER, inteligentny wybór"><div><strong>${esc(f.nazwa)}</strong>${www(f)}</div></header>`;
const tel = (f: Firma, cls = 'btn') => (f.telefon ? `<a class="${cls}" href="tel:${esc(f.telefon.replace(/[^\d+]/g, ''))}">Zadzwoń: ${esc(f.telefon)}</a>` : '');

/** Ta sama strona dla unieważnionego i nieznanego tokenu (nie zdradza, który był kiedyś ważny). */
const inactive = (f: Firma) => doc('Kod nieaktywny', `${head(f)}<div class="plate"><h1>Ten kod nie jest już aktywny</h1>
<p>${f.telefon ? `Zadzwoń do serwisu: <a class="btn" href="tel:${esc(f.telefon.replace(/[^\d+]/g, ''))}">${esc(f.telefon)}</a>` : `Skontaktuj się z firmą ${esc(f.nazwa)}.`}</p></div>`);

const PHOTO_ROW = 4;

async function passportPage(deps: AppDeps, token: string): Promise<string> {
  const { db, files } = deps;
  const f = svc.firma(db);
  const p = TOKEN_RE.test(token) ? svc.byToken(db, token) : undefined;
  const site = p && klienci.getSite(db, p.siteId);
  const client = site && klienci.get(db, site.clientId);
  if (!p || !site || !client) return inactive(f);
  const folders = svc.forClient(db, site.id);
  const ids = anchors(folders.map((t) => t.kategoria));
  const url = (key: string, name?: string) => files.url(key, FILE_TTL, name).then(esc);
  const today = dayOf(deps.now?.() ?? new Date());

  // Baner: najbliższy termin serwisu, gdy zaległy albo w ciągu 30 dni.
  const next = folders.filter((t) => t.nastepnySerwis).sort((a, b) => a.nastepnySerwis!.localeCompare(b.nastepnySerwis!))[0];
  const late = !!next && next.nastepnySerwis! < today;
  const mail = f.email ? `<a class="btn sec" href="mailto:${esc(f.email)}?subject=${esc(encodeURIComponent(`Serwis – paszport ${p.numer}`))}">Umów serwis e-mailem</a>` : '';
  const nextRow = next
    ? `<div class="next${late ? ' late' : ''}"><span>${late ? 'Serwis zaległy' : 'Następny serwis'}: <b>${pl(next.nastepnySerwis!)}</b></span><span>${esc(next.kategoria)}</span></div>`
    : '';

  const boxes: string[] = [];
  const thumbs = new Map(await Promise.all(folders.flatMap((t) => t.files.filter(svc.isPhoto)).map(async (a) => [a.id, await url(a.keyThumb ?? a.keyView ?? a.keyOrig)] as const)));
  const sections = await Promise.all(folders.map(async (t, i) => {
    const photos = t.files.filter(svc.isPhoto), docs = t.files.filter((a) => !svc.isPhoto(a));
    const devs = t.devices.map((d) => `<li class="dev"><b>${esc(d.nazwa)}</b>${[d.producent, d.model].some(Boolean) ? ` <span>${esc([d.producent, d.model].filter(Boolean).join(' '))}</span>` : ''}
${d.montaz || d.gwarancjaDo ? `<div class="m">${[d.montaz && `montaż ${pl(d.montaz)}`, d.gwarancjaDo && `gwarancja do ${pl(d.gwarancjaDo)}`].filter(Boolean).join(', ')}</div>` : ''}</li>`).join('');
    const entries = t.entries.map((e) => `<li><time datetime="${e.dzien}">${pl(e.dzien)}</time><span>${esc([e.czynnosci.join(', '), e.uwagi].filter(Boolean).join('. '))}</span></li>`).join('');
    const docList = (await Promise.all(docs.map(async (a) => `<a href="${await url(a.keyOrig, a.nazwa)}" rel="noopener">${esc(a.nazwa)}</a>`))).join('');
    // podgląd bez JS i bez zmiany adresu (pozycja strony zostaje): ukryty przełącznik + <label> otwiera/zamyka
    const tiles = photos.map((a) => `<label for="zd-${esc(a.id)}" class="tile"><img src="${thumbs.get(a.id)}" alt="Zdjęcie" loading="lazy"></label>`);
    boxes.push(...await Promise.all(photos.map(async (a) => `<input type="checkbox" class="sw" id="zd-${esc(a.id)}" aria-label="Podgląd zdjęcia"><div class="lb"><label class="x" for="zd-${esc(a.id)}"></label>
<figure><img src="${await url(a.keyView ?? a.keyOrig)}" alt="Zdjęcie" loading="lazy"><figcaption><label for="zd-${esc(a.id)}">Zamknij</label> <a href="${await url(a.keyOrig, a.nazwa)}" rel="noopener">Oryginał</a></figcaption></figure></div>`)));
    // jeden rząd 4 kafelków; więcej zdjęć → „+N” pokazuje resztę
    const more = `zr-${ids[i]}`;
    const photoList = tiles.length <= PHOTO_ROW ? (tiles.length ? `<div class="ph">${tiles.join('')}</div>` : '')
      : `<input type="checkbox" class="sw more" id="${more}" aria-label="Pokaż wszystkie zdjęcia (${tiles.length})"><div class="ph">${tiles.slice(0, PHOTO_ROW - 1).join('')}<label for="${more}" class="plus">+${tiles.length - PHOTO_ROW + 1}</label></div>`
        + `<div class="ph rest">${tiles.slice(PHOTO_ROW - 1).join('')}</div>`;
    const empty = !devs && !entries && !docList && !photoList;
    const due = t.nastepnySerwis ? `<span${t.nastepnySerwis < today ? ' class="late"' : ''}>serwis <b>${pl(t.nastepnySerwis)}</b></span>` : '';
    return `<section id="${ids[i]}"><div class="fh"><h2>${esc(t.kategoria)}</h2>${empty && !due ? '<span class="empty">brak wpisów</span>' : due}</div>
${devs ? `<h3>Urządzenia</h3><ul class="rows">${devs}</ul>` : ''}
${photoList ? `<h3>Zdjęcia</h3>${photoList}` : ''}
${entries ? `<h3>Historia serwisu</h3><ul class="rows entries">${entries}</ul>` : ''}
${docList ? `<h3>Dokumenty</h3><div class="docs">${docList}</div>` : ''}</section>`;
  }));

  const nav = folders.length > 1 ? `<nav aria-label="Teczki">${folders.map((t, i) => `<a href="#${ids[i]}">${esc(t.kategoria)}</a>`).join('')}</nav>` : '';
  const plate = `<div class="plate"><div class="top"><span class="lbl">Paszport instalacji</span><span class="no">${esc(p.numer)}</span></div>
<div><h1>${esc(client.nazwa)}</h1><div class="addr">${esc([site.adres, site.miejscowosc].filter(Boolean).join(', '))}</div></div>
${nextRow}<div class="btns">${tel(f)}${mail}</div></div>`;
  const foot = `<footer>${esc(f.nazwa)}${f.telefon ? `, tel. ${esc(f.telefon)}` : ''}${f.email ? `, ${esc(f.email)}` : ''}</footer>`;
  return doc(`Paszport ${p.numer}`, `${head(f)}${plate}${nav}${folders.length ? `<div class="sheet">${sections.join('')}</div>` : ''}${foot}${boxes.join('')}`);
}

export function publicRoutes(app: Hono, deps: AppDeps): void {
  // shortcut: in-memory, single process, max 5000 IPs (when full, the oldest window is dropped) — move to the DB if the app ever runs several processes
  const hits = new Map<string, { n: number; since: number }>();
  const allow = (ip: string): boolean => {
    const now = Date.now();
    const h = hits.get(ip);
    if (h && now - h.since < WINDOW) return ++h.n <= LIMIT;
    hits.delete(ip); // nowe okno trafia na koniec (Map trzyma kolejność wstawienia)
    if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value!);
    hits.set(ip, { n: 1, since: now });
    return true;
  };

  app.get('/p/:token', async (c) => {
    c.header('X-Robots-Tag', 'noindex, nofollow');
    c.header('Cache-Control', 'no-store');
    if (!allow(clientIp(c))) return c.text('Za dużo zapytań. Spróbuj za minutę.', 429);
    return c.html(await passportPage(deps, c.req.param('token')));
  });
}
