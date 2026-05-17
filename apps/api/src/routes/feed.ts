import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';

// Global feed across all of the user's plants — care events (manual + auto)
// merged with notification log (only sent, not suppressed). Used by the
// /feed tab per docs/design-summary.html §feed.

const WINDOW_DAYS = 60;
const LIMIT = 80;

type FeedSource = 'care' | 'push';

interface FeedItem {
  id: string;
  source: FeedSource;
  kind: string;
  occurredAt: string;
  plantId: string;
  plantName: string;
  deviceId: string | null;
  // For pushes: NotificationLog.body. For care events: the optional manual
  // note. Either may be null.
  body: string | null;
  // CareEvent only: 'manual' vs 'auto' (so the UI can label "Полив определён"
  // for auto vs just "Полив" for manual).
  careSource: 'manual' | 'auto' | null;
}

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/feed', { preHandler: requireUser }, async (req) => {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [careEvents, notifications] = await Promise.all([
      prisma.careEvent.findMany({
        where: {
          plant: { userId: req.userId },
          occurredAt: { gte: since },
        },
        orderBy: { occurredAt: 'desc' },
        take: LIMIT,
        include: { plant: { select: { id: true, name: true, deviceId: true } } },
      }),
      prisma.notificationLog.findMany({
        where: {
          userId: req.userId,
          plantId: { not: null },
          suppressedReason: null,
          sentAt: { gte: since },
        },
        orderBy: { sentAt: 'desc' },
        take: LIMIT,
      }),
    ]);

    // Notifications have a plantId but not the plant row; one extra fetch.
    const plantIds = Array.from(new Set(
      notifications.map((n) => n.plantId).filter((p): p is string => p != null),
    ));
    const plants = plantIds.length === 0
      ? []
      : await prisma.plant.findMany({
          where: { id: { in: plantIds } },
          select: { id: true, name: true, deviceId: true },
        });
    const plantById = new Map(plants.map((p) => [p.id, p]));

    const items: FeedItem[] = [];
    for (const e of careEvents) {
      items.push({
        id: `c:${e.id}`,
        source: 'care',
        kind: e.kind,
        occurredAt: e.occurredAt.toISOString(),
        plantId: e.plant.id,
        plantName: e.plant.name,
        deviceId: e.plant.deviceId,
        body: e.note,
        careSource: (e.source === 'auto' || e.source === 'manual') ? e.source : null,
      });
    }
    for (const n of notifications) {
      if (!n.plantId) continue;
      const plant = plantById.get(n.plantId);
      if (!plant) continue;
      items.push({
        id: `n:${n.id}`,
        source: 'push',
        kind: n.kind,
        occurredAt: n.sentAt.toISOString(),
        plantId: plant.id,
        plantName: plant.name,
        deviceId: plant.deviceId,
        body: n.body,
        careSource: null,
      });
    }

    items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return { items: items.slice(0, LIMIT) };
  });
}
