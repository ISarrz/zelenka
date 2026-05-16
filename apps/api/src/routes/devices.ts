import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { newToken } from '../lib/sessions.js';
import { GENERIC_THRESHOLDS, type CareThresholds } from '../lib/thresholds.js';
import { evaluate } from '../lib/verdict.js';

const CreateBody = z.object({ name: z.string().min(1).max(64) });

const BindPlantBody = z.object({
  speciesId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(64),
  photoUrl: z.string().url().nullable().optional(),
});

export async function deviceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/devices', { preHandler: requireUser }, async (req) => {
    const devices = await prisma.device.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: { plant: { include: { species: true } } },
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

  // Bind a plant to a device. Creates the Plant row (one per device) or
  // updates it if the user already had one for this device.
  app.post('/api/devices/:id/bind-plant', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findFirst({
      where: { id, userId: req.userId },
    });
    if (!device) { reply.code(404); return { error: 'device not found' }; }

    const parsed = BindPlantBody.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'invalid body' }; }

    if (parsed.data.speciesId) {
      const species = await prisma.plantSpecies.findUnique({ where: { id: parsed.data.speciesId } });
      if (!species) { reply.code(400); return { error: 'unknown species' }; }
    }

    const existing = await prisma.plant.findUnique({ where: { deviceId: device.id } });
    const data = {
      userId: req.userId!,
      deviceId: device.id,
      speciesId: parsed.data.speciesId ?? null,
      name: parsed.data.name,
      photoUrl: parsed.data.photoUrl ?? null,
      identifiedAt: new Date(),
    };
    const plant = existing
      ? await prisma.plant.update({ where: { id: existing.id }, data })
      : await prisma.plant.create({ data });
    return { plant };
  });

  app.get('/api/devices/:id/latest', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findFirst({
      where: { id, userId: req.userId },
      include: { plant: { include: { species: true } } },
    });
    if (!device) { reply.code(404); return { error: 'not found' }; }

    const latest = await prisma.measurement.findFirst({
      where: { deviceId: device.id },
      orderBy: { measuredAt: 'desc' },
    });

    const thresholds: CareThresholds =
      (device.plant?.species?.thresholds as unknown as CareThresholds | null) ?? GENERIC_THRESHOLDS;
    const verdict = latest
      ? evaluate(
          {
            temperatureC: latest.temperatureC,
            humidityPct: latest.humidityPct,
            lux: latest.lux,
            soilMoistureRaw: latest.soilMoistureRaw,
          },
          thresholds,
          device.plant?.identifiedAt ?? null,
        )
      : null;

    return {
      device: { id: device.id, name: device.name },
      plant: device.plant,
      measurement: latest,
      verdict,
      thresholds,
    };
  });
}
