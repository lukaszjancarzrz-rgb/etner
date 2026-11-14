import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId } from '@etner/shared';
import { testDeps, addUser } from '../test-utils.js';
import { errors, settings, users } from '../core/schema-base.js';
import { attachments } from '../modules/dziennik/schema.js';
import { kopieCrons, keysToCopy, copyPhotos } from './kopie.js';

const att = (over: Record<string, unknown> = {}) => ({
  id: newId(), createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', rodzaj: 'zdjecie' as const,
  keyOrig: 'o1', keyView: 'v1', keyThumb: 't1', nazwa: 'a.jpg', mime: 'image/jpeg', bajty: 10, authorId: 'u', ...over });

describe('zadania kopii', () => {
  it('kopia-zdjec: brak konfiguracji R2 pomija i nie przesuwa kursora', async () => {
    const deps = testDeps();
    await kopieCrons({}).find((c) => c.name === 'kopia-zdjec')!.run(deps);
    expect(deps.db.select().from(errors).where(eq(errors.where, 'kopia-zdjec')).all()).toHaveLength(0);
    expect(deps.db.select().from(settings).where(eq(settings.key, 'kopia_zdjec_at')).all()).toHaveLength(0);
  });

  it('kopia-zdjec: błąd kopiowania nie przesuwa kursora, NoSuchKey jest pomijane', async () => {
    const deps = testDeps();
    deps.db.insert(attachments).values([att(), att({ keyOrig: 'o2', keyView: null, keyThumb: null })]).run();
    const at = () => deps.db.select().from(settings).where(eq(settings.key, 'kopia_zdjec_at')).all();
    let n = 0;
    await expect(copyPhotos(deps.db, async () => { if (++n === 2) throw new Error('sieć'); }, '')).rejects.toThrow('sieć');
    expect(at()).toHaveLength(0);
    await copyPhotos(deps.db, async (k) => { if (k === 'o2') throw Object.assign(new Error('x'), { name: 'NoSuchKey' }); }, '');
    expect(at()).toHaveLength(1);
    expect(deps.db.select().from(errors).where(eq(errors.where, 'kopia-zdjec')).all()).toHaveLength(1);
  });

  it('kopia-zdjec: wybiera klucze załączników i zdjęć osób nowszych niż kopia_zdjec_at', async () => {
    const deps = testDeps();
    deps.db.insert(attachments).values([
      att({ createdAt: '2026-09-01T00:00:00.000Z' }),
      att({ keyOrig: 'o2', keyView: 'v2', keyThumb: 't2', createdAt: '2026-10-05T00:00:00.000Z' }),
      att({ keyOrig: 'o3', keyView: null, keyThumb: null, createdAt: '2026-10-06T00:00:00.000Z' }),
    ]).run();
    expect(keysToCopy(deps.db, '2026-10-01T00:00:00.000Z').sort()).toEqual(['o2', 'o3', 't2', 'v2']);
    // zdjęcia osób: zmienione po kursorze, z kluczem
    const u1 = addUser(deps).user.id, u2 = addUser(deps).user.id;
    addUser(deps);
    deps.db.update(users).set({ avatarKey: 'avatar/a.webp', updatedAt: '2026-10-07T00:00:00.000Z' }).where(eq(users.id, u1)).run();
    deps.db.update(users).set({ avatarKey: 'avatar/stary.webp', updatedAt: '2026-09-07T00:00:00.000Z' }).where(eq(users.id, u2)).run();
    expect(keysToCopy(deps.db, '2026-10-01T00:00:00.000Z').sort()).toEqual(['avatar/a.webp', 'o2', 'o3', 't2', 'v2']);
    deps.db.update(users).set({ avatarKey: null }).where(eq(users.id, u1)).run();
    const copied: string[] = [];
    const def = kopieCrons({}).find((c) => c.name === 'kopia-zdjec')!;
    expect(def.schedule).toBe('0 3 * * *');
    await copyPhotos(deps.db, async (k) => { copied.push(k); }, '2026-10-01T00:00:00.000Z');
    // zdjęcia osób z własnym kursorem: pierwszy raz wszystkie (także sprzed kursora załączników)
    expect(copied.sort()).toEqual(['avatar/stary.webp', 'o2', 'o3', 't2', 'v2']);
    expect(deps.db.select().from(settings).where(eq(settings.key, 'kopia_zdjec_at')).get()).toBeTruthy();
    copied.length = 0;
    await copyPhotos(deps.db, async (k) => { copied.push(k); }, '2026-10-01T00:00:00.000Z');
    expect(copied).not.toContain('avatar/stary.webp');
  });
});
