import { attachmentPatchSchema, diaryCreateSchema, klientFlagSchema, newId } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { body } from '../../core/body.js';
import { requireUser } from '../../core/auth.js';
import { makeVariants } from '../../core/files.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import { attachments } from './schema.js';
import * as svc from './service.js';

const MAX = 25 * 1024 * 1024;
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
const forbidden = () => new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** Rodzaj pliku po magic bytes (deklarowany typ jest ignorowany); Word/Excel: kontener ZIP z częścią word/ lub xl/, stary format OLE wg rozszerzenia nazwy. */
export function sniff(b: Buffer, name = ''): { ext: string; mime: string; img: boolean } | null {
  if (b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { ext: 'jpg', mime: 'image/jpeg', img: true };
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { ext: 'png', mime: 'image/png', img: true };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp', img: true };
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return { ext: 'pdf', mime: 'application/pdf', img: false };
  if (b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    if (b.includes('word/')) return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', img: false };
    if (b.includes('xl/')) return { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', img: false };
  }
  if (b.subarray(0, 8).equals(OLE)) {
    if (/\.doc$/i.test(name)) return { ext: 'doc', mime: 'application/msword', img: false };
    if (/\.xls$/i.test(name)) return { ext: 'xls', mime: 'application/vnd.ms-excel', img: false };
  }
  return null;
}

export function routes(app: Hono, deps: AppDeps): void {
  const { db, files } = deps;
  const auth = requireUser(db);
  deps.diary ??= svc.diaryOf(db);
  const admin = (c: Context) => { if (!can(c.get('user'), 'admin')) throw forbidden(); };

  // slack: nagłówki multipart; bodyLimit liczy też strumień bez Content-Length
  const limit = bodyLimit({ maxSize: MAX + 64 * 1024, onError: (c) => c.json({ error: 'Plik jest za duży (max 25 MB).' }, 413) });
  app.post('/api/uploads', auth, limit, async (c) => {
    const f = ((await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>)['file'];
    if (!(f instanceof File)) throw new HTTPException(400, { message: 'Brak pliku' });
    if (f.size > MAX) throw new HTTPException(413, { message: 'Plik jest za duży (max 25 MB).' });
    const buf = Buffer.from(await f.arrayBuffer());
    const kind = sniff(buf, f.name);
    if (!kind) throw new HTTPException(415, { message: 'Dozwolone są zdjęcia (JPEG, PNG, WebP), PDF, Word i Excel.' });
    const id = newId();
    const k = `att/${id}`;
    let keyView: string | null = null, keyThumb: string | null = null, w: number | null = null, h: number | null = null;
    if (kind.img) {
      const v = await makeVariants(buf).catch(() => { throw new HTTPException(415, { message: 'Nie udało się odczytać zdjęcia.' }); });
      keyView = `${k}/view.webp`; keyThumb = `${k}/thumb.webp`; w = v.w; h = v.h;
      await files.put(keyView, v.view, 'image/webp');
      await files.put(keyThumb, v.thumb, 'image/webp');
    }
    await files.put(`${k}/orig.${kind.ext}`, buf, kind.mime);
    const now = new Date().toISOString();
    const u = c.get('user').id;
    db.insert(attachments).values({
      id, rodzaj: kind.img ? 'zdjecie' : 'plik', keyOrig: `${k}/orig.${kind.ext}`, keyView, keyThumb,
      nazwa: (f.name.split(/[\\/]/).pop() || 'plik').slice(0, 200), mime: kind.mime, bajty: buf.length, w, h,
      authorId: u, createdAt: now, createdBy: u, updatedAt: now,
    }).run();
    return c.json({ uploadId: id });
  });

  app.post('/api/diary', auth, async (c) => {
    const b = await body(c, diaryCreateSchema);
    const user = c.get('user');
    const out: svc.Outbox = [];
    const { result, dup } = runOp(db, b.opId, user.id, () => svc.create(db, user, b, (id) => deps.schedule?.peopleForJob?.(id) ?? [], out));
    if (!dup) for (const o of out) void notify(deps, o.userIds, o.n).catch((e) => logError(db, 'push', e, user.id));
    return c.json(result);
  });

  app.patch('/api/diary/:id', auth, async (c) => {
    admin(c);
    const b = await body(c, klientFlagSchema);
    const r = svc.setKlient(db, c.get('user').id, c.req.param('id'), b.dla_klienta);
    if (!r) throw notFound();
    return c.json(r);
  });
  // „W paszporcie dla klienta” – admin; typ dokumentu – admin albo autor pliku, faktura tylko admin (P6)
  app.patch('/api/attachments/:id', auth, async (c) => {
    const { opId, dla_klienta, dlaKlienta = dla_klienta, typDok } = await body(c, attachmentPatchSchema);
    if (dlaKlienta === undefined && typDok === undefined) throw new HTTPException(400, { message: 'Brak zmian' });
    const user = c.get('user');
    const isAdmin = can(user, 'admin');
    const { result } = runOp(db, opId, user.id, () => {
      const a = svc.getAttachment(db, c.req.param('id'));
      if (!a?.ownerType || !svc.canSeeAttachment(db, user, a)) throw notFound();
      if (dlaKlienta !== undefined && !isAdmin) throw forbidden();
      if (typDok !== undefined && !isAdmin && (typDok === 'faktura' || a.authorId !== user.id)) throw forbidden();
      return svc.patchAttachment(db, user.id, a, { dlaKlienta, typDok });
    });
    return c.json(result);
  });

  app.delete('/api/diary/:id', auth, (c) => {
    if (!svc.remove(db, c.get('user'), c.req.param('id'))) throw notFound();
    return c.json({ ok: true });
  });

  app.get('/api/attachments/:id/file', auth, async (c) => {
    const a = svc.getAttachment(db, c.req.param('id'));
    if (!a?.ownerType || !svc.canSeeAttachment(db, c.get('user'), a)) throw notFound();
    const v = c.req.query('v');
    const key = (v === 'thumb' ? a.keyThumb : v === 'view' ? a.keyView : null) ?? a.keyOrig;
    return c.redirect(await files.url(key, undefined, key === a.keyOrig ? a.nazwa : undefined), 302);
  });
}
