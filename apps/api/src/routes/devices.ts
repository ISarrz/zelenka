import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { newToken } from '../lib/sessions.js';

const CreateBody = z.object({ name: z.string().min(1).max(64) });

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/devices', { preHandler: requireUser }, async (req) => {
    const devices = await prisma.device.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, deviceToken: true },
    });
    return { devices };
  });

  app.post('/api/devices', { preHandler: requireUser }, async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid name' };
    }
    const device = await prisma.device.create({
      data: {
        name: parsed.data.name,
        deviceToken: newToken(24),
        userId: req.userId!,
      },
    });
    return { device };
  });

  app.get('/api/devices/:id/latest', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findFirst({
      where: { id, userId: req.userId },
    });
    if (!device) {
      reply.code(404);
      return { error: 'not found' };
    }
    const latest = await prisma.measurement.findFirst({
      where: { deviceId: device.id },
      orderBy: { measuredAt: 'desc' },
    });
    return { device: { id: device.id, name: device.name }, measurement: latest };
  });
}
