import nodemailer from 'nodemailer';

/** Envoi d'e-mails aux clients (relances de validation, de paiement). null = pas configuré. */
export type Mailer = (to: string, subject: string, text: string) => Promise<void>;

/**
 * SMTP gratuit : par ex. une adresse Gmail avec un « mot de passe d'application »
 * (SMTP_URL = smtps://adresse%40gmail.com:motdepasse@smtp.gmail.com:465). Saisi dans Railway, jamais dans le code.
 */
export function smtpMailer(url: string | undefined, from: string | undefined): Mailer | null {
  if (!url) return null;
  const t = nodemailer.createTransport(url);
  const sender = from ?? decodeURIComponent(new URL(url).username);
  return async (to, subject, text) => { await t.sendMail({ from: sender, to, subject, text }); };
}
