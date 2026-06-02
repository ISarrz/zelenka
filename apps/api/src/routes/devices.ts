import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { newToken } from '../lib/sessions.js';
import { buildBatteryStatus } from '../lib/battery.js';
import { BRIGHT_LUX_THRESHOLD, GENERIC_THRESHOLDS, type CareThresholds } from '../lib/thresholds.js';
import { evaluate } from '../lib/verdict.js';
import { soilPctFromRaw } from '../lib/soil.js';

// Count distinct hour-buckets in the last 24h where lux crossed the bright
// threshold at least once. That count is the "did the plant get its daily
// light" metric verdict grades against minSunHours.
async function countBrightHours(deviceId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ hours: bigint | number }>>`
    SELECT COUNT(DISTINCT date_trunc('hour', "measuredAt")) AS hours
    FROM "Measurement"
    WHERE "deviceId" = ${deviceId}
      AND "measuredAt" >= ${since}
      AND "lux" IS NOT NULL
      AND "lux" >= ${BRIGHT_LUX_THRESHOLD}
  `;
  const n = rows[0]?.hours ?? 0;
  return typeof n === 'bigint' ? Number(n) : n;
}

const CreateBody = z.object({ name: z.string().min(1).max(64) });

const ClaimBody = z.object({ token: z.string().min(8).max(128) });

// At least one of dryRaw/wetRaw is required. Each is a 12-bit ADC reading
// (0–4095) — server-side we don't enforce ordering at write time, the soil
// helper bails out gracefully on bad ordering.
const CalibrationBody = z
  .object({
    dryRaw: z.number().int().min(0).max(4095).optional(),
    wetRaw: z.number().int().min(0).max(4095).optional(),
  })
  .refine((b) => b.dryRaw !== undefined || b.wetRaw !== undefined, {
    message: 'at least one of dryRaw, wetRaw is required',
  });

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

  // Bind an orphan (factory-minted) device to the current user. Token is the
  // value printed on the QR sticker; the firmware has the same value baked
  // into NVS, so after claim the user only fills Wi-Fi creds on the captive
  // portal. Idempotent for the same user, 409 if already owned by someone else.
  app.post('/api/devices/claim', { preHandler: requireUser }, async (req, reply) => {
    const parsed = ClaimBody.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: 'invalid token' }; }

    const device = await prisma.device.findUnique({ where: { deviceToken: parsed.data.token } });
    if (!device) { reply.code(404); return { error: 'unknown device' }; }
    if (device.userId && device.userId !== req.userId) {
      reply.code(409);
      return { error: 'already claimed' };
    }
    if (device.userId === req.userId) return { device };

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { userId: req.userId!, claimedAt: new Date() },
    });
    return { device: updated };
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

  // Hard delete — owner only. Prisma cascades Measurement rows via the
  // onDelete: Cascade relation; the linked Plant has onDelete: SetNull so
  // history about the plant survives (the user might want to re-create the
  // device and rebind later — though for now the UI doesn't expose that).
  app.delete('/api/devices/:id', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findFirst({ where: { id, userId: req.userId } });
    if (!device) { reply.code(404); return { error: 'not found' }; }
    await prisma.device.delete({ where: { id } });
    reply.code(204);
    return null;
  });

  // Persist per-device soil-moisture calibration. Body carries the latest
  // raw ADC reading captured at the corresponding step in setup ("sensor in
  // air" → dryRaw, "sensor in water" → wetRaw). Either or both can be sent.
  app.post('/api/devices/:id/calibration', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findFirst({ where: { id, userId: req.userId } });
    if (!device) { reply.code(404); return { error: 'not found' }; }
    const parsed = CalibrationBody.safeParse(req.body);
    if (!parsed.success) { reply.code(400); return { error: parsed.error.issues[0]?.message ?? 'invalid body' }; }
    const updated = await prisma.device.update({
      where: { id },
      data: {
        ...(parsed.data.dryRaw !== undefined ? { soilDryRaw: parsed.data.dryRaw } : {}),
        ...(parsed.data.wetRaw !== undefined ? { soilWetRaw: parsed.data.wetRaw, soilWetCalibratedAt: new Date() } : {}),
      },
    });
    return { device: updated };
  });

  // Software-trigger factory reset. The flag is delivered to the device on
  // its next measurement POST (which is also where it's cleared atomically),
  // so the user can reset a sealed sensor without physical access.
  app.post('/api/devices/:id/factory-reset', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const device = await prisma.device.findFirst({ where: { id, userId: req.userId } });
    if (!device) { reply.code(404); return { error: 'not found' }; }
    await prisma.device.update({
      where: { id },
      data: { pendingFactoryReset: true },
    });
    return { status: 'queued' };
  });

  // Replace a device with a fresh one, carrying history + plant binding over
  // to the new device-id. Used when the physical sensor breaks. All-or-nothing
  // transaction: measurements + plant are reassigned to the new id before the
  // old row is dropped, so a partial failure leaves the user's data intact.
  app.post('/api/devices/:id/replace', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const old = await prisma.device.findFirst({
      where: { id, userId: req.userId },
      include: { plant: true },
    });
    if (!old) { reply.code(404); return { error: 'not found' }; }

    const result = await prisma.$transaction(async (tx) => {
      const newDevice = await tx.device.create({
        data: {
          name: old.name,
          deviceToken: newToken(24),
          userId: req.userId!,
        },
      });
      await tx.measurement.updateMany({
        where: { deviceId: old.id },
        data: { deviceId: newDevice.id },
      });
      if (old.plant) {
        await tx.plant.update({
          where: { id: old.plant.id },
          data: { deviceId: newDevice.id },
        });
      }
      await tx.device.delete({ where: { id: old.id } });
      return newDevice;
    });

    return { device: result };
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

  // Rename a plant in-place (no species change, no cold-start reset). Used
  // by the home-screen tap-on-title affordance — handy when Plant.id picked
  // a Latin/English name the user wants to overwrite.
  app.post('/api/devices/:id/rename-plant', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1).max(64) }).safeParse(req.body);
    if (!body.success) { reply.code(400); return { error: 'invalid body' }; }
    const device = await prisma.device.findFirst({ where: { id, userId: req.userId } });
    if (!device) { reply.code(404); return { error: 'not found' }; }
    const plant = await prisma.plant.findUnique({ where: { deviceId: device.id } });
    if (!plant) { reply.code(404); return { error: 'no plant bound' }; }
    const updated = await prisma.plant.update({
      where: { id: plant.id },
      data: { name: body.data.name },
    });
    return { plant: updated };
  });

  // Time-series for charts. For 7-day windows we return raw points (~1k);
  // for 30-day we down-sample to hourly averages on the DB side so the
  // payload stays well under 100 KB.
  app.get('/api/devices/:id/measurements', { preHandler: requireUser }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const days = Math.max(1, Math.min(90, Number((req.query as { days?: string }).days ?? 7)));
    const device = await prisma.device.findFirst({ where: { id, userId: req.userId } });
    if (!device) { reply.code(404); return { error: 'not found' }; }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    if (days <= 7) {
      const rows = await prisma.measurement.findMany({
        where: { deviceId: device.id, measuredAt: { gte: since } },
        orderBy: { measuredAt: 'asc' },
        select: {
          measuredAt: true,
          temperatureC: true,
          humidityPct: true,
          lux: true,
          soilMoistureRaw: true,
          batteryRaw: true,
          batteryMv: true,
          wifiRssi: true,
        },
      });
      return { samples: rows, downsampled: false };
    }

    // Hourly buckets via raw SQL — Postgres date_trunc.
    const rows = await prisma.$queryRaw<Array<{
      bucket: Date;
      temperatureC: number | null;
      humidityPct: number | null;
      lux: number | null;
      soilMoistureRaw: number | null;
      batteryRaw: number | null;
      batteryMv: number | null;
      wifiRssi: number | null;
    }>>`
      SELECT
        date_trunc('hour', "measuredAt") AS bucket,
        AVG("temperatureC")::float    AS "temperatureC",
        AVG("humidityPct")::float     AS "humidityPct",
        AVG("lux")::float             AS "lux",
        AVG("soilMoistureRaw")::float AS "soilMoistureRaw",
        AVG("batteryRaw")::float      AS "batteryRaw",
        AVG("batteryMv")::float       AS "batteryMv",
        AVG("wifiRssi")::float        AS "wifiRssi"
      FROM "Measurement"
      WHERE "deviceId" = ${device.id}
        AND "measuredAt" >= ${since}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    return {
      samples: rows.map((r) => ({
        measuredAt: r.bucket,
        temperatureC: r.temperatureC,
        humidityPct: r.humidityPct,
        lux: r.lux,
        soilMoistureRaw: r.soilMoistureRaw == null ? null : Math.round(r.soilMoistureRaw),
        batteryRaw: r.batteryRaw == null ? null : Math.round(r.batteryRaw),
        batteryMv: r.batteryMv == null ? null : Math.round(r.batteryMv),
        wifiRssi: r.wifiRssi == null ? null : Math.round(r.wifiRssi),
      })),
      downsampled: true,
    };
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

    // Existing species rows predate minSunHours, so layer them over the
    // generic defaults — species values override per-key, anything missing
    // (notably minSunHours) is filled in.
    const speciesThresholds =
      (device.plant?.species?.thresholds as unknown as CareThresholds | null) ?? null;
    const thresholds: CareThresholds = { ...GENERIC_THRESHOLDS, ...(speciesThresholds ?? {}) };
    const hoursBrightToday = await countBrightHours(device.id);
    const verdict = latest
      ? evaluate(
          {
            temperatureC: latest.temperatureC,
            humidityPct: latest.humidityPct,
            lux: latest.lux,
            hoursBrightToday,
            soilMoistureRaw: latest.soilMoistureRaw,
            soilMoisturePct: latest.soilMoisturePct ?? soilPctFromRaw(latest.soilMoistureRaw, device),
          },
          thresholds,
          device.plant?.identifiedAt ?? null,
        )
      : null;

    // Shape species: drop the heavy `rawDetails` blob from the wire (latest is
    // polled every 10s on home), but pull out human-facing fields out of it.
    const slimmedPlant = device.plant ? {
      ...device.plant,
      species: device.plant.species ? speciesForWire(device.plant.species) : null,
    } : null;

    // Inject calibrated soilMoisturePct into the wire copy if the stored
    // value is null (i.e. the firmware didn't send it) but we have both
    // calibration anchors. Keeps reads consistent whether or not the
    // sample was stored before calibration was set.
    const measurementForWire = latest && latest.soilMoisturePct == null
      ? { ...latest, soilMoisturePct: soilPctFromRaw(latest.soilMoistureRaw, device) }
      : latest;

    // Most recent watering — for the home-screen "Полив N дн назад" chip.
    // Considers both manual and auto-detected entries, picks the latest.
    const lastWatering = device.plant ? await prisma.careEvent.findFirst({
      where: { plantId: device.plant.id, kind: 'water' },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    }) : null;

    return {
      device: {
        id: device.id,
        name: device.name,
        firmwareVersion: device.firmwareVersion,
        wifiRssi: device.wifiRssi,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        soilDryRaw: device.soilDryRaw,
        soilWetRaw: device.soilWetRaw,
      },
      plant: slimmedPlant,
      lastWateringAt: lastWatering?.occurredAt?.toISOString() ?? null,
      measurement: measurementForWire,
      verdict,
      thresholds,
      battery: latest
        ? buildBatteryStatus(latest.batteryRaw, latest.batteryMv, {
            cyclesSinceLastCharge: device.cyclesSinceLastCharge,
            cyclesPerFullBattery: device.cyclesPerFullBattery,
            lastChargeAt: device.lastChargeAt,
          })
        : null,
    };
  });
}

// Slim a PlantSpecies row for the API wire format. Pulls description + family
// out of the raw Perenual blob and drops the blob itself.
function speciesForWire(species: {
  id: string;
  scientificName: string;
  commonNameRu: string | null;
  commonNameEn: string | null;
  defaultImageUrl: string | null;
  family: string | null;
  thresholds: unknown;
  rawDetails: unknown;
}) {
  const raw = (species.rawDetails as Record<string, unknown> | null) ?? null;
  const description = typeof raw?.description === 'string' && raw.description.trim().length > 0
    ? raw.description as string
    : null;
  return {
    id: species.id,
    scientificName: species.scientificName,
    commonNameRu: species.commonNameRu,
    commonNameEn: species.commonNameEn,
    defaultImageUrl: species.defaultImageUrl,
    family: species.family,
    description,
    thresholds: species.thresholds,
  };
}
