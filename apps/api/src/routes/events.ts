import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';

const CreateEvent = z.object({
  kind: z.enum(['water', 'fertilize', 'repot', 'moved', 'other']),
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(200).nullable().optional(),
});

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/plants/:id/events', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const plant = await prisma.plant.findFirst({ where: { id, userId: req.userId } });
    if (!plant) { reply.code(404); return { error: 'not found' }; }

    const events = await prisma.careEvent.findMany({
      where: { plantId: plant.id },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
    return { events };
  });

  app.post('/api/plants/:id/events', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const plant = await prisma.plant.findFirst({ where: { id, userId: req.userId } });
    if (!plant) { reply.code(404); return { error: 'not found' }; }

    const parsed = CreateEvent.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'invalid body' }; }

    const event = await prisma.careEvent.create({
      data: {
        plantId: plant.id,
        kind: parsed.data.kind,
        occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
        note: parsed.data.note ?? null,
        source: 'manual',
      },
    });
    return { event };
  });

  app.delete('/api/plants/:plantId/events/:eventId', { preHandler: requireUser }, async (req, reply) => {
    const { plantId, eventId } = req.params as { plantId: string; eventId: string };
    const plant = await prisma.plant.findFirst({ where: { id: plantId, userId: req.userId } });
    if (!plant) { reply.code(404); return { error: 'not found' }; }
    await prisma.careEvent.deleteMany({ where: { id: eventId, plantId } });
    return { status: 'ok' };
  });
}
