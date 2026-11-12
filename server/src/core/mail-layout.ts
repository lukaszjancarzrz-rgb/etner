/** Szablon e-maila ETNER: logo, tytuł, treść, przycisk, stopka. Tabele i style w linii (Gmail, Outlook, telefony). */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const C = { ink: '#0a2240', ink2: '#5b6b7f', action: '#0070ab', line: '#dde3ea', bg: '#eef2f6' };
const FONT = "font-family:Arial,'Helvetica Neue',Helvetica,sans-serif";

export function mailLayout(o: { tytul: string; zajawka: string; tresc: string; przycisk?: { tekst: string; url: string }; stopka: string; baseUrl?: string }): string {
  const base = (o.baseUrl ?? '').replace(/\/$/, '');
  const logo = base
    ? `<img src="${esc(base)}/logo.png" width="210" alt="ETNER – Inteligentny wybór" style="display:block;border:0;width:210px;max-width:100%;height:auto">`
    : `<span style="${FONT};font-size:26px;font-weight:800;color:${C.ink};letter-spacing:1px">ETNER</span>`;
  const btn = o.przycisk
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px"><tr><td style="background:${C.action};border-radius:4px">
<a href="${esc(o.przycisk.url)}" style="display:inline-block;padding:13px 24px;${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">${esc(o.przycisk.tekst)}</a></td></tr></table>`
    : '';
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.tytul)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.zajawka)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:6px">
<tr><td style="padding:22px 28px 18px;border-bottom:4px solid ${C.action}">${logo}</td></tr>
<tr><td style="padding:26px 28px 8px;${FONT};color:${C.ink}">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${C.ink}">${esc(o.tytul)}</h1>
${o.tresc}
${btn}
</td></tr>
<tr><td style="padding:18px 28px 24px;${FONT};font-size:12px;line-height:1.5;color:${C.ink2};border-top:1px solid ${C.line}">${o.stopka}</td></tr>
</table></td></tr></table></body></html>`;
}

export const MAIL = { C, FONT };
