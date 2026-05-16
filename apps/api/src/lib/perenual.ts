// Read-only access to the Perenual catalog mirror. Direct `pg` client rather
// than a second Prisma datasource — keeps things simple and matches the
// promise that we never write to this DB.

import pg from 'pg';
import { config } from '../config.js';

const pool = config.perenualDatabaseUrl
  ? new pg.Pool({ connectionString: config.perenualDatabaseUrl, max: 4 })
  : null;

export interface PerenualHit {
  id: number;
  scientificName: string;       // first entry from the jsonb array
  commonName: string | null;
  family: string | null;
  watering: string | null;
  sunlight: string[] | null;
  defaultImageUrl: string | null;
  details: Record<string, unknown> | null;
}

function pickFirst(arr: unknown): string | null {
  if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') return arr[0];
  return null;
}

export async function findBestPerenualMatch(scientificName: string): Promise<PerenualHit | null> {
  if (!pool) return null;
  const q = `
    SELECT id, common_name, scientific_name, family, watering, sunlight,
           default_image, raw_details_v1_json
    FROM species
    WHERE scientific_name::text ILIKE $1
    ORDER BY
      CASE WHEN scientific_name::text ILIKE $2 THEN 0 ELSE 1 END,
      details_v1_fetched DESC,
      id ASC
    LIMIT 1
  `;
  // First pass — exact match (with quotes), then broader contains.
  const exact = `%"${scientificName}"%`;
  const broad = `%${scientificName.split(' ').slice(0, 2).join(' ')}%`;
  const { rows } = await pool.query(q, [broad, exact]);
  if (rows.length === 0) return null;

  const r = rows[0];
  const di = r.default_image as { regular_url?: string; original_url?: string } | null;
  return {
    id: r.id,
    scientificName: pickFirst(r.scientific_name) ?? scientificName,
    commonName: r.common_name ?? null,
    family: r.family ?? null,
    watering: r.watering ?? null,
    sunlight: Array.isArray(r.sunlight) ? r.sunlight : null,
    defaultImageUrl: di?.regular_url ?? di?.original_url ?? null,
    details: r.raw_details_v1_json ?? null,
  };
}
