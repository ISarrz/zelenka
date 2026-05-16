import { config } from '../config.js';

/**
 * Sprint 0: only "console" transport. The PWA polls the API logs (or the dev
 * just reads them) to grab the magic-link URL. Production wires Resend/Postmark
 * here without touching call sites.
 */
export async function sendMagicLink(email: string, url: string): Promise<void> {
  if (config.mailTransport === 'console') {
    // eslint-disable-next-line no-console
    console.log(
      `\n=== magic link ===\n  to:  ${email}\n  url: ${url}\n==================\n`,
    );
    return;
  }
  throw new Error(`Unknown MAIL_TRANSPORT=${config.mailTransport}`);
}
