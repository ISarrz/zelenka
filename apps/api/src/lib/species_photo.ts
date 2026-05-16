// Eager-download species photos so we don't depend on Perenual's presigned
// Wasabi URLs (they expire after 24h). Called once when a PlantSpecies row
// is first resolved.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export interface PhotoDownload {
  ok: boolean;
  contentType?: string;
  bytes?: number;
}

export async function ensurePhotoDir(): Promise<void> {
  await fs.mkdir(config.speciesPhotosDir, { recursive: true });
}

export function localPhotoPath(speciesId: string): string {
  return path.join(config.speciesPhotosDir, `${speciesId}.jpg`);
}

export async function localPhotoExists(speciesId: string): Promise<boolean> {
  try {
    const st = await fs.stat(localPhotoPath(speciesId));
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

export async function downloadPhoto(speciesId: string, sourceUrl: string): Promise<PhotoDownload> {
  await ensurePhotoDir();
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return { ok: false };
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    if (!ct.startsWith('image/')) return { ok: false };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 256) return { ok: false }; // suspiciously small, probably an error page
    await fs.writeFile(localPhotoPath(speciesId), buf);
    return { ok: true, contentType: ct, bytes: buf.byteLength };
  } catch {
    return { ok: false };
  }
}

/**
 * Copies the Perenual species image from the local read-only mirror into our
 * writable cache, keyed by our internal speciesId. Used in preference to
 * downloadPhoto() because Perenual's S3 URLs are presigned and expire after
 * 24 h, which is shorter than the time between seed refreshes.
 */
export async function copyFromUpstreamMirror(
  speciesId: string,
  perenualId: number,
): Promise<PhotoDownload> {
  await ensurePhotoDir();
  const src = path.join(config.perenualPhotosDir, String(perenualId), 'medium.jpg');
  try {
    const data = await fs.readFile(src);
    if (data.byteLength < 256) return { ok: false };
    await fs.writeFile(localPhotoPath(speciesId), data);
    return { ok: true, contentType: 'image/jpeg', bytes: data.byteLength };
  } catch {
    return { ok: false };
  }
}
