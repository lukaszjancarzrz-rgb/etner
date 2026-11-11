/** Wspólne zdarzenia aplikacji: 'session-expired', 'outbox' (zmiana kolejki), 'outbox-failed' (detail: {kind, message}), 'synced' (sync.tried). */
export const bus = new EventTarget();
export const emit = (type: string, detail?: unknown) => bus.dispatchEvent(new CustomEvent(type, { detail }));

/** Adres serwera; w przeglądarce pusty (ten sam host), w testach absolutny. */
export const cfg = { base: '' };

/** Kody błędów serwera → tekst dla człowieka. */
const CODES: Record<string, string> = {
  LEAD_MA_ZLECENIE: 'Ten lead ma już zlecenie',
  LOGIN_ZAJETY: 'Ten login jest już zajęty',
  BRAK_UPRAWNIEN: 'Nie masz uprawnień do tej zmiany',
  PUMBLE: 'Pumble nie odpowiada, spróbuj za chwilę',
  ZA_DUZO_PROB: 'Za dużo prób, spróbuj ponownie za kilkanaście minut',
  ZLE_HASLO: 'Obecne hasło jest nieprawidłowe',
  ZLE_DANE: 'Nieprawidłowy login lub hasło',
  WARTOSC_W_UZYCIU: 'Ta wartość jest w użyciu',
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

/**
 * fetch + JSON. Błąd sieci przechodzi jako TypeError (limit czasu jako DOMException), odpowiedź nie-2xx jako ApiError.
 * Limit czasu domyślnie 20 s; bez limitu dla wysyłki plików (FormData). Kolejka offline traktuje przekroczenie jak brak sieci.
 */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; timeout?: number } = {}): Promise<T> {
  const { json, timeout = 20_000, ...rest } = init;
  const res = await fetch(cfg.base + path, {
    credentials: 'same-origin',
    ...(!rest.signal && !(rest.body instanceof FormData) && typeof AbortSignal.timeout === 'function' && { signal: AbortSignal.timeout(timeout) }),
    ...rest,
    ...(json !== undefined && { body: JSON.stringify(json), headers: { 'content-type': 'application/json', ...rest.headers } }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof body?.error === 'string' && body.error !== 'SESJA' ? CODES[body.error] ?? body.error : res.status === 401 ? 'Zaloguj się ponownie' : 'Błąd serwera – spróbuj ponownie.';
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}
