import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';

const Settings = z.object({
  timezone: z.string().min(1).max(64).optional(),
  quietHoursStartMin: z.number().int().min(0).max(60 * 24 - 1).nullable().optional(),
  quietHoursEndMin:   z.number().int().min(0).max(60 * 24 - 1).nullable().optional(),
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me/settings', { preHandler: requireUser }, async (req) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: {
        id: true, email: true, timezone: true,
        quietHoursStartMin: true, quietHoursEndMin: true,
      },
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
        ...(parsed.data.quietHoursStartMin !== undefined ? { quietHoursStartMin: parsed.data.quietHoursStartMin } : {}),
        ...(parsed.data.quietHoursEndMin   !== undefined ? { quietHoursEndMin: parsed.data.quietHoursEndMin } : {}),
      },
      select: {
        id: true, email: true, timezone: true,
        quietHoursStartMin: true, quietHoursEndMin: true,
      },
    });
    return { user };
  });
}
