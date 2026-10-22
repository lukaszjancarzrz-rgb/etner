/** Wspólne zdarzenia aplikacji: 'session-expired', 'outbox' (zmiana kolejki), 'outbox-failed' (detail: {kind, message}). */
export const bus = new EventTarget();
export const emit = (type: string, detail?: unknown) => bus.dispatchEvent(new CustomEvent(type, { detail }));

/** Adres serwera; w przeglądarce pusty (ten sam host), w testach absolutny. */
export const cfg = { base: '' };

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
    const msg = typeof body?.error === 'string' && body.error !== 'SESJA' ? body.error : res.status === 401 ? 'Zaloguj się ponownie' : 'Błąd serwera – spróbuj ponownie.';
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}
