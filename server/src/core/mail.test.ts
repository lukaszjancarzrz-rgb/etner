import { describe, expect, it, vi } from 'vitest';
import { brevoMailerFromEnv, mailerFromEnv } from './mail.js';

describe('Brevo', () => {
  const m = { to: 'a@b.pl', subject: 'T', text: 't', html: '<p>t</p>' };
  it('wysyła przez API z kluczem i nadawcą; błąd API = wyjątek z treścią', async () => {
    const f = vi.fn(async () => new Response('{"messageId":"x"}', { status: 201 }));
    await brevoMailerFromEnv({ BREVO_API_KEY: 'k', MAIL_FROM: 'etner@firma.pl' }, f as typeof fetch)!(m);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('k');
    expect(JSON.parse(init.body as string)).toMatchObject({ sender: { email: 'etner@firma.pl' }, to: [{ email: 'a@b.pl' }], subject: 'T' });
    const zle = vi.fn(async () => new Response('{"message":"sender not valid"}', { status: 400 }));
    await expect(brevoMailerFromEnv({ BREVO_API_KEY: 'k', MAIL_FROM: 'x@y.pl' }, zle as typeof fetch)!(m)).rejects.toThrow('Brevo 400: {"message":"sender not valid"}');
  });
  it('bez klucza SMTP; bez nadawcy nic', () => {
    expect(mailerFromEnv({ SMTP_HOST: 'smtp.x', SMTP_PORT: '465', MAIL_FROM: 'a@b.pl' })?.przez).toBe('SMTP smtp.x:465');
    expect(mailerFromEnv({ BREVO_API_KEY: 'k', SMTP_HOST: 'smtp.x', MAIL_FROM: 'a@b.pl' })?.przez).toBe('Brevo');
    expect(brevoMailerFromEnv({ BREVO_API_KEY: 'k' })).toBeUndefined();
    expect(mailerFromEnv({})).toBeUndefined();
  });
});
