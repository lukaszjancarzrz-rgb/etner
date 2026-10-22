import { PumbleError, type PumbleClient, type PumbleMessage, type PumbleUser } from './pumble.js';

/**
 * Atrapa Pumble w pamięci: testy oraz tryb demo z PUMBLE_FAKE=1 (tylko DEMO=1, nigdy produkcja).
 * `fail = true` – każde wywołanie kończy się błędem sieci (status 0); `failOn` – tylko wskazane metody (np. 'addUsers'), z podanym statusem.
 * Jak w specyfikacji: bot nie pisze do kanału prywatnego (403).
 */
export function fakePumble(users: PumbleUser[] = []) {
  let n = 0;
  const id = () => `p${String(++n).padStart(6, '0')}`;
  const channels = new Map<string, { id: string; name: string; type: string; description: string; members: Set<string>; messages: PumbleMessage[] }>();
  const s = {
    fail: false,
    failOn: new Map<string, number>(),
    /** Typ zwracany przez getChannel (atrapa Pumble, które zignorowało 'private'). */
    forceType: undefined as string | undefined,
    users,
    channels,
    calls: [] as string[],
    workspaceId: 'ws-demo',
    /** Wiadomość od osoby z Pumble (do testów i demo). */
    post(channelId: string, author: string, text: string, at = new Date(), files?: unknown[]): PumbleMessage {
      const m: PumbleMessage = { id: id(), channelId, author, text, timestamp: at.toISOString(), timestampMilli: at.getTime(), ...(files && { files }) };
      channels.get(channelId)!.messages.unshift(m); // najnowsze pierwsze, jak w Pumble
      return m;
    },
  };
  const guard = (what: string) => {
    s.calls.push(what);
    if (s.fail) throw new PumbleError(0, 'atrapa: brak połączenia', `/${what}`);
    const st = s.failOn.get(what);
    if (st !== undefined) throw new PumbleError(st, 'atrapa: odmowa', `/${what}`);
  };
  const ch = (cid: string, what = '') => { const c = channels.get(cid); if (!c) throw new PumbleError(403, 'Could not find channel with that identifier', what); return c; };
  const client: PumbleClient = {
    async createChannel(d) {
      guard('createChannel');
      if (d.type !== 'PRIVATE' && d.type !== 'PUBLIC') throw new PumbleError(403, 'Allowed values are PUBLIC|PRIVATE', '/createChannel');
      if ([...channels.values()].some((c) => c.name === d.name)) throw new PumbleError(403, 'Channel name taken');
      const c = { id: id(), ...d, members: new Set<string>(), messages: [] };
      channels.set(c.id, c);
      return { id: c.id, name: c.name };
    },
    async getChannel(by) {
      guard('getChannel');
      const c = [...channels.values()].find((x) => ('channelId' in by ? x.id === by.channelId : x.name === by.channel));
      return c ? { id: c.id, name: c.name, type: s.forceType ?? c.type } : null;
    },
    async addUsers(cid, ids) {
      guard('addUsers');
      const bad = ids.find((u) => !s.users.some((x) => x.id === u));
      if (bad) throw new PumbleError(403, `Unknown user ${bad}`, '/addUsersToChannel');
      for (const u of ids) ch(cid, '/addUsersToChannel').members.add(u);
    },
    async listMessages(cid, limit) { guard('listMessages'); return ch(cid, '/listMessages').messages.slice(0, limit); },
    async sendMessage(d) {
      guard('sendMessage');
      ch(d.channelId, '/sendMessage'); // prawdziwe Pumble pozwala botowi pisać w kanale prywatnym (sprawdzone na żywo 2026-10-22)
      const m = s.post(d.channelId, d.asBot ? 'bot' : 'me', d.text);
      if (d.asBot) m.authorAppId = 'etner';
      return { id: m.id, channelId: d.channelId };
    },
    async listUsers() { guard('listUsers'); return s.users; },
    async myInfo() { guard('myInfo'); return { id: 'me', email: 'wlasciciel@example.com', name: 'Właściciel', workspaceId: s.workspaceId }; },
  };
  return Object.assign(s, { client });
}
export type FakePumble = ReturnType<typeof fakePumble>;
