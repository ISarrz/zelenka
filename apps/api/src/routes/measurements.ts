import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireDevice } from '../lib/auth.js';
import { evaluatePushTriggers } from '../lib/rules.js';
import type { CareThresholds } from '../lib/thresholds.js';
import { GENERIC_THRESHOLDS } from '../lib/thresholds.js';
import { evaluate, type RingStatus } from '../lib/verdict.js';

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

const Batch = z.object({ samples: z.array(Sample).min(1).max(64) });

export async function measurementRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/device/measurements', { preHandler: requireDevice }, async (req, reply) => {
    // Discriminate on the presence of `samples` rather than a zod union —
    // a union would happily match `{samples:[...]}` against the single-sample
    // schema (all fields optional!) and silently drop the array.
    const body = req.body as Record<string, unknown> | null;
    let samples: z.infer<typeof Sample>[];
    if (body && typeof body === 'object' && 'samples' in body) {
      const parsed = Batch.safeParse(body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid batch', issues: parsed.error.issues };
      }
      samples = parsed.data.samples;
    } else {
      const parsed = Sample.safeParse(body);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'invalid sample', issues: parsed.error.issues };
      }
      samples = [parsed.data];
    }
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

    // Rule engine — evaluate only against the most recent sample in the
    // batch (the older ones are stale by definition).
    const device = await prisma.device.findUnique({
      where: { id: req.deviceId! },
      include: {
        user: { select: { id: true, quietHoursStartMin: true, quietHoursEndMin: true } },
        plant: { include: { species: true } },
      },
    });
    const plant = device?.plant;
    if (device && plant) {
      const last = samples[samples.length - 1];
      const measuredAt = last.measuredAt ? new Date(last.measuredAt) : now;
      const thresholds: CareThresholds =
        (plant.species?.thresholds as unknown as CareThresholds | null) ?? GENERIC_THRESHOLDS;
      const verdict = evaluate(
        {
          temperatureC: last.temperatureC ?? null,
          humidityPct: last.humidityPct ?? null,
          lux: last.lux ?? null,
          soilMoistureRaw: last.soilMoistureRaw ?? null,
        },
        thresholds,
        plant.identifiedAt,
      );

      // Pull the previous-but-one measurement for sharp-change detection.
      const prevMeasurement = await prisma.measurement.findFirst({
        where: { deviceId: device.id, measuredAt: { lt: measuredAt } },
        orderBy: { measuredAt: 'desc' },
      });

      await evaluatePushTriggers({
        plant: {
          id: plant.id,
          userId: plant.userId,
          name: plant.name,
          thresholds,
          prevRingStatus: (plant.lastRingStatus as RingStatus | null) ?? null,
          prevTemperatureC: prevMeasurement?.temperatureC ?? null,
          prevMeasuredAt: prevMeasurement?.measuredAt ?? null,
        },
        measurement: {
          temperatureC: last.temperatureC ?? null,
          humidityPct: last.humidityPct ?? null,
          lux: last.lux ?? null,
          soilMoistureRaw: last.soilMoistureRaw ?? null,
          measuredAt,
        },
        newVerdict: verdict,
        quietHours: {
          startMin: device.user.quietHoursStartMin ?? null,
          endMin: device.user.quietHoursEndMin ?? null,
        },
      });

      await prisma.plant.update({
        where: { id: plant.id },
        data: { lastRingStatus: verdict.ring },
      });
    }

    return { stored: samples.length };
  });
}
