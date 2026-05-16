import { Resend } from 'resend';
import { config } from '../config.js';

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

/**
 * Sends the magic-link URL to the user. Two transports:
 *   - "console" (default) — logs to API stdout. Used in dev and during
 *     Sprint 0/1 deploys when no real provider is wired.
 *   - "resend" — uses Resend's API. Requires RESEND_API_KEY + RESEND_FROM.
 */
export async function sendMagicLink(email: string, url: string): Promise<void> {
  if (config.mailTransport === 'resend' && resend) {
    const subject = 'Вход в Zelenka';
    const text = `Откройте эту ссылку, чтобы войти. Действительна 15 минут.\n\n${url}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
        <h1 style="font-size:1.4rem;margin:0 0 12px">Вход в Zelenka</h1>
        <p style="color:#555;margin:0 0 20px">Откройте эту ссылку, чтобы войти. Действительна 15 минут.</p>
        <a href="${url}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Войти</a>
        <p style="color:#777;font-size:.85rem;margin-top:24px;word-break:break-all">Если кнопка не работает, скопируйте ссылку:<br>${url}</p>
      </div>
    `;
    const { error } = await resend.emails.send({
      from: config.resendFrom,
      to: email,
      subject,
      text,
      html,
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n=== magic link ===\n  to:  ${email}\n  url: ${url}\n==================\n`,
  );
}
