import { PumbleError, type PumbleClient, type PumbleMessage, type PumbleUser } from './pumble.js';

/**
 * Atrapa Pumble w pamięci: testy oraz tryb demo z PUMBLE_FAKE=1 (tylko DEMO=1, nigdy produkcja).
 * `fail = true` – każde wywołanie kończy się błędem 503.
 */
export function fakePumble(users: PumbleUser[] = []) {
  let n = 0;
  const id = () => `p${String(++n).padStart(6, '0')}`;
  const channels = new Map<string, { id: string; name: string; type: string; description: string; members: Set<string>; messages: PumbleMessage[] }>();
  const s = {
    fail: false,
    users,
    channels,
    calls: [] as string[],
    workspaceId: 'ws-demo',
    /** Wiadomość od osoby z Pumble (do testów i demo). */
    post(channelId: string, author: string, text: string, at = new Date()): PumbleMessage {
      const m = { id: id(), channelId, author, text, timestamp: at.toISOString(), timestampMilli: at.getTime() };
      channels.get(channelId)!.messages.unshift(m); // najnowsze pierwsze, jak w Pumble
      return m;
    },
  };
  const guard = (what: string) => { s.calls.push(what); if (s.fail) throw new PumbleError(503, 'atrapa: niedostępne'); };
  const ch = (cid: string) => { const c = channels.get(cid); if (!c) throw new PumbleError(403, 'Could not find channel with that identifier'); return c; };
  const client: PumbleClient = {
    async createChannel(d) {
      guard('createChannel');
      if ([...channels.values()].some((c) => c.name === d.name)) throw new PumbleError(403, 'Channel name taken');
      const c = { id: id(), ...d, members: new Set<string>(), messages: [] };
      channels.set(c.id, c);
      return { id: c.id, name: c.name };
    },
    async getChannel(name) {
      guard('getChannel');
      const c = [...channels.values()].find((x) => x.name === name);
      return c ? { id: c.id, name: c.name } : null;
    },
    async addUsers(cid, ids) { guard('addUsers'); for (const u of ids) ch(cid).members.add(u); },
    async listMessages(cid, limit) { guard('listMessages'); return ch(cid).messages.slice(0, limit); },
    async sendMessage(d) {
      guard('sendMessage');
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
