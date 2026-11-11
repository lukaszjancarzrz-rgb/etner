import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string };
export type Mailer = (m: Mail) => Promise<void>;

/** SMTP z env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM); brak hosta lub nadawcy = undefined (e-maile wyłączone). */
export function smtpMailerFromEnv(env: NodeJS.ProcessEnv): Mailer | undefined {
  if (!env.SMTP_HOST || !env.MAIL_FROM) return undefined;
  const port = Number(env.SMTP_PORT ?? 587);
  const t = nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
    // krótkie limity: zły host/port albo zablokowane połączenie = czytelny błąd w kilkanaście sekund, nie 2 minuty ciszy
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  return async (m) => { await t.sendMail({ from: env.MAIL_FROM, ...m }); };
}

/** Brevo (HTTPS API, port 443 – nie blokowany jak SMTP na Render): BREVO_API_KEY + MAIL_FROM (nadawca potwierdzony w Brevo). */
export function brevoMailerFromEnv(env: NodeJS.ProcessEnv, f: typeof fetch = fetch): Mailer | undefined {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) return undefined;
  return async (m) => {
    const r = await f('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY!, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { email: env.MAIL_FROM, name: 'ETNER' }, to: [{ email: m.to }], subject: m.subject, textContent: m.text, htmlContent: m.html, ...(m.replyTo && { replyTo: { email: m.replyTo } }) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 300)}`);
  };
}

/** Brevo, gdy jest klucz; inaczej SMTP; brak obu = e-maile wyłączone. */
export const mailerFromEnv = (env: NodeJS.ProcessEnv): Mailer | undefined => brevoMailerFromEnv(env) ?? smtpMailerFromEnv(env);
