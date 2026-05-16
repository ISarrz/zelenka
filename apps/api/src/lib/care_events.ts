import { prisma } from '../db.js';

// Auto-detected care events. Sprint 5 ships one detector: watering, by way
// of a sharp drop in raw soil-moisture between consecutive samples (the
// capacitive V1.2 reads lower = wetter). Other auto-events (cold draft,
// "moved" via lux jump) live in future sprints.

// Relative-drop threshold for a wateringg detection. Empirically the soil
// goes from 2500 (dry) to 1200 (just watered) — a ~50% drop. We trigger
// at 25% to be safe.
const WATERING_DROP_RATIO = 0.25;
// Don't auto-record another watering within this window (sensor noise can
// produce additional drops during a single soak).
const WATERING_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export async function detectAutoEvents(args: {
  plantId: string;
  prevSoilRaw: number | null;
  newSoilRaw: number | null;
  occurredAt: Date;
}): Promise<void> {
  const { plantId, prevSoilRaw, newSoilRaw, occurredAt } = args;
  if (prevSoilRaw == null || newSoilRaw == null) return;
  if (prevSoilRaw <= 0) return;
  const dropRatio = (prevSoilRaw - newSoilRaw) / prevSoilRaw;
  if (dropRatio < WATERING_DROP_RATIO) return;

  const recent = await prisma.careEvent.findFirst({
    where: {
      plantId,
      kind: 'water',
      source: 'auto',
      occurredAt: { gte: new Date(occurredAt.getTime() - WATERING_COOLDOWN_MS) },
    },
  });
  if (recent) return;

  await prisma.careEvent.create({
    data: {
      plantId,
      kind: 'water',
      occurredAt,
      source: 'auto',
      note: `Soil ${prevSoilRaw} → ${newSoilRaw}`,
    },
  });
}
