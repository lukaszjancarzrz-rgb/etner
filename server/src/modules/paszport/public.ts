import { getConnInfo } from '@hono/node-server/conninfo';
import { addDays, anchors, dayOf, type Firma } from '@etner/shared';
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

/** Adres klienta: ostatni wpis X-Forwarded-For (dopisany przez proxy Render; wcześniejsze podaje sam klient), inaczej gniazdo. */
function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for')?.split(',').pop()?.trim();
  if (fwd) return fwd;
  try { return getConnInfo(c).remote.address ?? '?'; } catch { return '?'; }
}

const CSS = `:root{--bg:#f2f5f8;--card:#fff;--ink:#0a2240;--mut:#3f5368;--line:#d3dce5;--link:#0070ab;--ok:#00736b;--warn:#a85d00}
@media (prefers-color-scheme:dark){:root{--bg:#0a2240;--card:#102e52;--ink:#f2f5f8;--mut:#b7c4d1;--line:#2a4a70;--link:#7cc4ee;--ok:#5fd3c4;--warn:#ffb85c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:16px}a{color:var(--link)}h1,h2,h3{line-height:1.25;margin:0 0 8px}h1{font-size:2rem}h2{font-size:1.5rem}h3{font-size:1.1rem;margin-top:20px}
header{display:flex;gap:16px;align-items:center;margin:8px 0 20px}header img{width:72px;height:72px}header strong{display:block;font-size:1.75rem;font-weight:800;letter-spacing:.02em;line-height:1.1}header .small{font-size:1rem}.mut{color:var(--mut)}.small{font-size:.875rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px}
.ban{border-left:4px solid var(--ok)}.ban.late{border-left-color:var(--warn)}
.btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.btn{display:inline-block;padding:10px 16px;border-radius:8px;background:var(--link);color:#fff;text-decoration:none;font-weight:600}
.btn.sec{background:transparent;color:var(--link);border:1px solid var(--link)}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}nav a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--card);text-decoration:none}
ul{margin:0;padding-left:20px}li{margin:4px 0}.list{list-style:none;padding:0}.list>li{border-top:1px solid var(--line);padding:8px 0}.list>li:first-child{border-top:0}
.ph{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.ph img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;display:block}
.phs>summary{list-style:none;cursor:pointer}.phs>summary::-webkit-details-marker{display:none}.phs>.ph{margin-top:8px}.phs[open] .plus{display:none}
.plus{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:8px;background:var(--line);font-size:1.5rem;font-weight:800}
.entries>li{font-size:.875rem;padding:6px 0}.entries ul{margin:2px 0}.entries li li{margin:0}
.lead{font-size:1.15rem}
@media (prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}`;

const doc = (title: string, body: string) => `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`;

const head = (f: Firma) => `<header><img src="/icon.svg" alt=""><div><strong>${esc(f.nazwa)}</strong>${f.www ? `<div class="small"><a href="https://${esc(f.www.replace(/^https?:\/\//, ''))}" rel="noopener">${esc(f.www)}</a></div>` : ''}</div></header>`;
const tel = (f: Firma, cls = 'btn') => (f.telefon ? `<a class="${cls}" href="tel:${esc(f.telefon.replace(/[^\d+]/g, ''))}">Zadzwoń do serwisu: ${esc(f.telefon)}</a>` : '');

/** Ta sama strona dla unieważnionego i nieznanego tokenu (nie zdradza, który był kiedyś ważny). */
const inactive = (f: Firma) => doc('Kod nieaktywny', `${head(f)}<div class="card"><h1>Ten kod nie jest już aktywny</h1>
<p>${f.telefon ? `Zadzwoń: <a href="tel:${esc(f.telefon.replace(/[^\d+]/g, ''))}">${esc(f.telefon)}</a>` : `Skontaktuj się z firmą ${esc(f.nazwa)}.`}</p></div>`);

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
  const url = (key: string) => files.url(key, FILE_TTL).then(esc);
  const today = dayOf(deps.now?.() ?? new Date());

  // Baner: najbliższy termin serwisu, gdy zaległy albo w ciągu 30 dni.
  const next = folders.filter((t) => t.nastepnySerwis).sort((a, b) => a.nastepnySerwis!.localeCompare(b.nastepnySerwis!))[0];
  const late = !!next && next.nastepnySerwis! < today;
  const soon = !!next && next.nastepnySerwis! <= addDays(today, 30);
  const mail = f.email ? `<a class="btn sec" href="mailto:${esc(f.email)}?subject=${esc(encodeURIComponent(`Serwis – paszport ${p.numer}`))}">Umów serwis</a>` : '';
  const banner = `<div class="card ban${late ? ' late' : ''}">${soon
    ? `<strong>${late ? 'Serwis zaległy' : 'Zbliża się serwis'}: ${esc(next!.kategoria)}</strong><div>Termin: ${pl(next!.nastepnySerwis!)}</div>`
    : '<strong>Serwis i pytania</strong>'}<div class="btns">${tel(f)}${mail}</div></div>`;

  const sections = await Promise.all(folders.map(async (t, i) => {
    const photos = t.files.filter(svc.isPhoto), docs = t.files.filter((a) => !svc.isPhoto(a));
    const devs = t.devices.map((d) => `<li><strong>${esc(d.nazwa)}</strong>${[d.producent, d.model].some(Boolean) ? `<div>${esc([d.producent, d.model].filter(Boolean).join(' '))}</div>` : ''}
<div class="small mut">${[d.montaz && `Montaż: ${pl(d.montaz)}`, d.gwarancjaDo && `Gwarancja do: ${pl(d.gwarancjaDo)}`].filter(Boolean).join(' · ')}</div></li>`).join('');
    const entries = t.entries.map((e) => `<li><strong>${pl(e.dzien)}</strong> <span class="small mut">technik ETNER</span>
${e.czynnosci.length ? `<ul>${e.czynnosci.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${e.uwagi ? `<div>${esc(e.uwagi)}</div>` : ''}</li>`).join('');
    const docList = (await Promise.all(docs.map(async (a) => `<li><a href="${await url(a.keyOrig)}" rel="noopener">${esc(a.nazwa)}</a></li>`))).join('');
    const tiles = await Promise.all(photos.map(async (a) =>
      `<a href="${await url(a.keyOrig)}" rel="noopener"><img src="${await url(a.keyThumb ?? a.keyView ?? a.keyOrig)}" alt="Zdjęcie" loading="lazy"></a>`));
    // jeden rząd 4 kafelków; więcej zdjęć → „+N” rozwija resztę (details, bez JS)
    const photoList = tiles.length <= PHOTO_ROW ? (tiles.length ? `<div class="ph">${tiles.join('')}</div>` : '')
      : `<details class="phs"><summary aria-label="Pokaż wszystkie zdjęcia (${tiles.length})"><div class="ph">${tiles.slice(0, PHOTO_ROW - 1).join('')}<span class="plus">+${tiles.length - PHOTO_ROW + 1}</span></div></summary>`
        + `<div class="ph">${tiles.slice(PHOTO_ROW - 1).join('')}</div></details>`;
    const empty = !devs && !entries && !docList && !photoList;
    return `<section class="card" id="${ids[i]}"><h2>${esc(t.kategoria)}</h2>
${t.nastepnySerwis ? `<p>Następny serwis: <strong>${pl(t.nastepnySerwis)}</strong></p>` : ''}
${devs ? `<h3>Urządzenia</h3><ul class="list">${devs}</ul>` : ''}
${photoList ? `<h3>Zdjęcia</h3>${photoList}` : ''}
${entries ? `<h3>Historia serwisu</h3><ul class="list entries">${entries}</ul>` : ''}
${docList ? `<h3>Dokumenty</h3><ul>${docList}</ul>` : ''}
${empty ? '<p class="mut">Na razie brak wpisów.</p>' : ''}</section>`;
  }));

  const nav = folders.length > 1 ? `<nav>${folders.map((t, i) => `<a href="#${ids[i]}">${esc(t.kategoria)}</a>`).join('')}</nav>` : '';
  return doc(`Paszport ${p.numer}`, `${head(f)}<div class="card"><p class="mut small">Twoja instalacja</p><h1>${esc(client.nazwa)}</h1>
<div class="lead">${esc([site.adres, site.miejscowosc].filter(Boolean).join(', '))}</div><div class="small mut">Paszport ${esc(p.numer)}</div></div>
${banner}${nav}${sections.join('')}`);
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
