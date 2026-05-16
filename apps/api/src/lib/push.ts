import webpush from 'web-push';
import { config } from '../config.js';
import { prisma } from '../db.js';

let configured = false;
function configure() {
  if (configured) return;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    throw new Error('VAPID keys not configured');
  }
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;   // deep-link path inside the PWA
  tag?: string;   // dedupes notifications with the same tag on the device
}

/**
 * Send a push to every active subscription for the user. Removes subscriptions
 * that the push service marks as gone (410) — they're dead browsers.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{
  delivered: number;
  removed: number;
}> {
  configure();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);
  let delivered = 0;
  let removed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.authKey } },
        body,
      );
      delivered++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } });
        removed++;
      } else {
        // eslint-disable-next-line no-console
        console.warn('push failed (kept sub):', s.endpoint.slice(0, 60), err);
      }
    }
  }));
  return { delivered, removed };
}
