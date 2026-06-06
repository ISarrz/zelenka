import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';

const Settings = z.object({
  timezone: z.string().min(1).max(64).optional(),
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me/settings', { preHandler: requireUser }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true, timezone: true },
    });
    return { user };
  });

  app.patch('/api/me/settings', { preHandler: requireUser }, async (req, reply) => {
    const parsed = Settings.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'invalid', issues: parsed.error.issues }; }
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data: {
        ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {}),
      },
      select: { id: true, email: true, timezone: true },
    });
    return { user };
  });
}
