import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; html: string };
export type Mailer = (m: Mail) => Promise<void>;

/** SMTP z env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM); brak hosta lub nadawcy = undefined (e-maile wyłączone). */
export function smtpMailerFromEnv(env: NodeJS.ProcessEnv): Mailer | undefined {
  if (!env.SMTP_HOST || !env.MAIL_FROM) return undefined;
  const port = Number(env.SMTP_PORT ?? 587);
  const t = nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
  });
  return async (m) => { await t.sendMail({ from: env.MAIL_FROM, ...m }); };
}
