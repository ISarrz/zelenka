import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { sendPushToUser } from '../lib/push.js';

const Subscribe = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const Unsubscribe = z.object({ endpoint: z.string().url() });

const QuietHours = z.object({
  startMin: z.number().int().min(0).max(60 * 24 - 1).nullable(),
  endMin: z.number().int().min(0).max(60 * 24 - 1).nullable(),
});

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/push/vapid-public-key', async () => ({
    key: config.vapidPublicKey || null,
  }));

  app.post('/api/push/subscribe', { preHandler: requireUser }, async (req, reply) => {
    const parsed = Subscribe.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'invalid subscription' }; }
    const { endpoint, keys } = parsed.data;
    // Upsert by endpoint — handles re-subscribes (e.g. browser re-registered
    // SW with the same key).
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: req.userId!, p256dh: keys.p256dh, authKey: keys.auth },
      create: {
        endpoint,
        userId: req.userId!,
        p256dh: keys.p256dh,
        authKey: keys.auth,
      },
    });
    return { id: sub.id };
  });

  app.post('/api/push/unsubscribe', { preHandler: requireUser }, async (req, reply) => {
    const parsed = Unsubscribe.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'invalid' }; }
    await prisma.pushSubscription.deleteMany({
      where: { userId: req.userId, endpoint: parsed.data.endpoint },
    });
    return { status: 'ok' };
  });

  app.post('/api/push/test', { preHandler: requireUser }, async (req) => {
    const r = await sendPushToUser(req.userId!, {
      title: 'Zelenka',
      body: 'Тестовое уведомление — push работает.',
      url: '/',
    });
    return r;
  });

  app.get('/api/me/quiet-hours', { preHandler: requireUser }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { quietHoursStartMin: true, quietHoursEndMin: true },
    });
    return {
      startMin: user?.quietHoursStartMin ?? null,
      endMin: user?.quietHoursEndMin ?? null,
    };
  });

  app.post('/api/me/quiet-hours', { preHandler: requireUser }, async (req, reply) => {
    const parsed = QuietHours.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'invalid' }; }
    await prisma.user.update({
      where: { id: req.userId! },
      data: {
        quietHoursStartMin: parsed.data.startMin,
        quietHoursEndMin: parsed.data.endMin,
      },
    });
    return { status: 'ok' };
  });
}
