import { Camera, Trash } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { api, ApiError } from '../../core/api.js';
import { squarePhoto } from '../../core/photo.js';
import { store, type Rec } from '../../core/store.js';
import { Avatar } from '../../core/ui/avatar.js';
import { Button } from '../../core/ui/button.js';
import { toast } from '../../core/ui/toast.js';

/** Zdjęcie użytkownika: wybór (kadr do kwadratu w telefonie, serwer robi 256 px) albo usunięcie. Sam lub admin; wymaga sieci. */
export function AvatarUpload({ user }: { user: Rec }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function run(f: () => Promise<Rec>) {
    setBusy(true);
    try { store.put('users', await f()); }
    catch (e) { toast('Zdjęcie nie zostało zapisane', { body: e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.', tone: 'error' }); }
    finally { setBusy(false); }
  }
  async function pick(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('file', await squarePhoto(file), 'avatar.jpg');
    await run(() => api<Rec>(`/api/users/${user.id}/avatar`, { method: 'POST', body: fd }));
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar userId={user.id} name={user.name} size="xl" />
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} data-testid="avatar-file" />
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}><Camera className="h-5 w-5" />{busy ? 'Zapisywanie…' : user.avatarKey ? 'Zmień zdjęcie' : 'Dodaj zdjęcie'}</Button>
        {user.avatarKey && <Button variant="ghost" size="sm" disabled={busy} className="text-danger" onClick={() => void run(() => api<Rec>(`/api/users/${user.id}/avatar`, { method: 'DELETE' }))}><Trash className="h-5 w-5" />Usuń zdjęcie</Button>}
      </div>
    </div>
  );
}
