// Pumble przez dodatek „API Keys” (nagłówek ApiKey). Brak klucza = brak klienta = funkcja wyłączona.
export type PumbleUser = { id: string; email: string; name: string; workspaceId?: string; isAddonBot?: boolean; isPumbleBot?: boolean };
export type PumbleMessage = {
  id: string; channelId?: string; author: string; text: string; timestamp?: string; timestampMilli?: number;
  deleted?: boolean; authorAppId?: string | null; threadRootId?: string | null; files?: unknown[]; attachments?: unknown[];
};

export type PumbleChannel = { id: string; name: string; type?: string; channelType?: string };

export interface PumbleClient {
  /** Prawdziwe Pumble przyjmuje tylko 'PRIVATE' | 'PUBLIC' (małe litery → 403 „Allowed values are PUBLIC|PRIVATE”). */
  createChannel(d: { name: string; type: 'PRIVATE' | 'PUBLIC'; description: string }): Promise<{ id: string; name: string }>;
  /** Kanał o tej nazwie lub id albo null (Pumble odpowiada wtedy błędem). Specyfikacja nie obiecuje typu kanału; czytamy go, jeśli przyjdzie. */
  getChannel(q: { channel: string } | { channelId: string }): Promise<PumbleChannel | null>;
  addUsers(channelId: string, userIds: string[]): Promise<void>;
  listMessages(channelId: string, limit: number): Promise<PumbleMessage[]>;
  sendMessage(d: { channelId: string; text: string; asBot: boolean }): Promise<{ id: string; channelId: string }>;
  listUsers(): Promise<PumbleUser[]>;
  myInfo(): Promise<PumbleUser>;
}

export class PumbleError extends Error {
  /** `path`: wywołany adres bez zapytania, np. '/listUsers'. */
  constructor(public status: number, message: string, public path = '') { super(`Pumble ${status} ${path}: ${message}`); }
}

const GLOBAL_PATHS = new Set(['/listUsers', '/myInfo']);
/** Błąd całego Pumble (brak sieci, zły klucz, limit zapytań 429, awaria), a nie jednego kanału: przerywa obieg odpytywania. */
export const isGlobalPumbleError = (e: unknown): boolean =>
  e instanceof PumbleError && (e.status === 0 || e.status === 401 || e.status === 429 || e.status >= 500 || (e.status === 403 && GLOBAL_PATHS.has(e.path)));

const BASE = 'https://pumble-api-keys.addons.marketplace.cake.com';

export function pumbleClient(apiKey: string, base = BASE, timeoutMs = 10_000): PumbleClient {
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(base + path, {
        method, signal: AbortSignal.timeout(timeoutMs),
        headers: { ApiKey: apiKey, ...(body !== undefined && { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new PumbleError(0, e instanceof Error ? e.message : String(e), path.split('?')[0]); // sieć lub limit czasu
    }
    const txt = await res.text();
    if (!res.ok) throw new PumbleError(res.status, txt.slice(0, 300), path.split('?')[0]);
    return (txt ? JSON.parse(txt) : null) as T;
  }
  const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();
  return {
    createChannel: (d) => call('POST', '/createChannel', d),
    // Pumble zwraca kanał opakowany: { channel: { id, name, channelType, … } }; brak kanału → 403
    getChannel: (by) => call<PumbleChannel | { channel: PumbleChannel }>('GET', `/getChannel?${q(by)}`).then((r) => (r && 'channel' in r ? r.channel : r)).catch((e) => {
      if (e instanceof PumbleError && e.status >= 400 && e.status < 500) return null;
      throw e;
    }),
    addUsers: async (channelId, userIds) => { await call('POST', '/addUsersToChannel', { userIds, channelId }); },
    listMessages: (channelId, limit) => call<PumbleMessage[] | { messages?: PumbleMessage[] }>('GET', `/listMessages?${q({ channelId, limit })}`)
      .then((r) => (Array.isArray(r) ? r : r?.messages ?? [])),
    sendMessage: (d) => call('POST', '/sendMessage', d),
    listUsers: () => call('GET', '/listUsers'),
    myInfo: () => call('GET', '/myInfo'),
  };
}
