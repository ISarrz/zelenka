import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDevice } from '../lib/auth.js';

// One physical sample from the sensor. All fields nullable so firmware can ship
// an early build that only fills, say, temperatureC + soilMoistureRaw.
const Sample = z.object({
  measuredAt: z.string().datetime().optional(),
  temperatureC: z.number().finite().nullable().optional(),
  humidityPct: z.number().finite().min(0).max(100).nullable().optional(),
  pressureHpa: z.number().finite().nullable().optional(),
  lux: z.number().finite().min(0).nullable().optional(),
  soilMoistureRaw: z.number().int().nullable().optional(),
  soilMoisturePct: z.number().finite().min(0).max(100).nullable().optional(),
});

// Batch shape — what the firmware POSTs. Single-sample bodies also accepted.
const Body = z.union([
  Sample,
  z.object({ samples: z.array(Sample).min(1).max(64) }),
]);

export async function measurementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/device/measurements', { preHandler: requireDevice }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid body', issues: parsed.error.issues };
    }

    const samples = 'samples' in parsed.data ? parsed.data.samples : [parsed.data];
    const now = new Date();

    await prisma.measurement.createMany({
      data: samples.map((s) => ({
        deviceId: req.deviceId!,
        measuredAt: s.measuredAt ? new Date(s.measuredAt) : now,
        temperatureC: s.temperatureC ?? null,
        humidityPct: s.humidityPct ?? null,
        pressureHpa: s.pressureHpa ?? null,
        lux: s.lux ?? null,
        soilMoistureRaw: s.soilMoistureRaw ?? null,
        soilMoisturePct: s.soilMoisturePct ?? null,
      })),
    });

    return { stored: samples.length };
  });
}
