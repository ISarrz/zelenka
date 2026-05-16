import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

// Firmware OTA distribution.
//
// The on-disk layout (in production /srv/zelenka/firmware/):
//   manifest.json
//   zelenka-0.1.0.bin
//   zelenka-0.1.1.bin
//   ...
//
// The device fetches /api/firmware/manifest.json on each successful cycle,
// compares the version against its running app_desc.version, and downloads
// /api/firmware/zelenka-X.Y.Z.bin if a newer one is published.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In the container, the working dir is /app and we mount /app/firmware to the
// host's /srv/zelenka/firmware. Locally during dev, we resolve relative to the
// repo root. The env var lets compose override either.
const FIRMWARE_DIR = process.env.FIRMWARE_DIR
  ?? path.resolve(__dirname, '../../firmware');

export async function firmwareRoutes(app: FastifyInstance): Promise<void> {
  await app.register(fastifyStatic, {
    root: FIRMWARE_DIR,
    prefix: '/api/firmware/',
    decorateReply: false,
    cacheControl: false,
    setHeaders: (res, filename) => {
      if (filename.endsWith('.bin')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      if (filename.endsWith('manifest.json')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });
}
