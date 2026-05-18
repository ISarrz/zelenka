import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireUser } from '../lib/auth.js';
import { identifyPlant } from '../lib/plantid.js';
import { findBestPerenualMatch, searchPerenual } from '../lib/perenual.js';
import {
  copyFromUpstreamMirror,
  downloadPhoto,
  localPhotoExists,
  localPhotoPath,
} from '../lib/species_photo.js';
import { GENERIC_THRESHOLDS, notificationTextsFromPerenual, thresholdsFromPerenual } from '../lib/thresholds.js';

// 3 identifications per rolling 7d, per the design doc.
const ID_LIMIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ID_LIMIT_COUNT = 3;

export async function plantRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/plants/identify', { preHandler: requireUser }, async (req, reply) => {
    // Rate limit first — cheaper than a failed identification.
    const since = new Date(Date.now() - ID_LIMIT_WINDOW_MS);
    const used = await prisma.identificationRequest.count({
      where: { userId: req.userId!, createdAt: { gte: since } },
    });
    if (used >= ID_LIMIT_COUNT) {
      reply.code(429);
      return {
        error: 'quota exceeded',
        message: `Лимит ${ID_LIMIT_COUNT} распознаваний за 7 дней исчерпан. Попробуйте позже или выберите вид вручную.`,
        remainingMs: ID_LIMIT_WINDOW_MS,
      };
    }

    const parts = req.parts();
    const images: Buffer[] = [];
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'image') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        images.push(Buffer.concat(chunks));
        if (images.length >= 3) break;
      }
    }
    if (images.length === 0) {
      reply.code(400);
      return { error: 'no image' };
    }

    let result;
    try {
      result = await identifyPlant(images);
    } catch (err) {
      reply.code(503);
      return { error: 'identification failed', message: (err as Error).message };
    }

    await prisma.identificationRequest.create({
      data: {
        userId: req.userId!,
        scientificName: result.suggestions[0]?.scientificName ?? null,
        rawResponse: result.raw as Prisma.InputJsonValue,
      },
    });

    return {
      suggestions: result.suggestions,
      quota: { used: used + 1, limit: ID_LIMIT_COUNT, windowDays: 7 },
    };
  });

  // Manual species picker — typeahead over the Perenual mirror. Returns
  // small hits (no thresholds/details), enough to render the list. Picking
  // a row goes through /resolve to actually create the PlantSpecies + bind.
  app.get('/api/plants/species/search', { preHandler: requireUser }, async (req) => {
    const q = (req.query as { q?: string }).q?.trim() ?? '';
    const hits = await searchPerenual(q, 25);
    return { hits };
  });

  // Get-or-create a PlantSpecies row by scientific name. Looks up Perenual to
  // populate thresholds + image; falls back to generic if no match.
  app.post('/api/plants/species/resolve', { preHandler: requireUser }, async (req, reply) => {
    const body = z
      .object({ scientificName: z.string().min(1).max(120) })
      .safeParse(req.body);
    if (!body.success) {
      reply.code(400);
      return { error: 'invalid scientificName' };
    }

    const existing = await prisma.plantSpecies.findUnique({
      where: { scientificName: body.data.scientificName },
    });
    if (existing) return { species: existing };

    const hit = await findBestPerenualMatch(body.data.scientificName);
    const thresholds = hit
      ? thresholdsFromPerenual({
          watering: hit.watering,
          sunlight: hit.sunlight,
          details: hit.details,
          minSunHours: hit.minSunHours,
        })
      : GENERIC_THRESHOLDS;
    const notifTexts = hit ? notificationTextsFromPerenual({ watering: hit.watering }) : null;

    const created = await prisma.plantSpecies.create({
      data: {
        scientificName: body.data.scientificName,
        perenualId: hit?.id ?? null,
        commonNameEn: hit?.commonName ?? null,
        family: hit?.family ?? null,
        defaultImageUrl: null,
        thresholds: thresholds as unknown as Prisma.InputJsonValue,
        notificationTexts: (notifTexts ?? null) as unknown as Prisma.InputJsonValue,
        rawDetails: (hit?.details ?? null) as Prisma.InputJsonValue,
      },
    });

    // Cache the species photo locally. Prefer the read-only Perenual photo
    // mirror (medium.jpg, shipped via rsync from the dev box); fall back to
    // their presigned Wasabi URL — which is usually dead by the time anyone
    // resolves a species, since dumps live longer than 24 h.
    let cached = false;
    if (hit?.id) {
      const r = await copyFromUpstreamMirror(created.id, hit.id);
      if (r.ok) cached = true;
    }
    if (!cached && hit?.defaultImageUrl) {
      const r = await downloadPhoto(created.id, hit.defaultImageUrl);
      if (r.ok) cached = true;
    }
    if (cached) {
      const proxied = `/api/plants/species/${created.id}/photo`;
      await prisma.plantSpecies.update({
        where: { id: created.id },
        data: { defaultImageUrl: proxied },
      });
      created.defaultImageUrl = proxied;
    }

    return { species: created };
  });

  app.get('/api/plants/species/:id/photo', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await localPhotoExists(id))) {
      reply.code(404);
      return { error: 'no photo' };
    }
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(createReadStream(localPhotoPath(id)));
  });
}
