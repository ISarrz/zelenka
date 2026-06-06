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
  // Min hours of bright light per day per upstream xSunlightDuration. Used
  // to grade lux as "hours-bright vs target" rather than instant lux.
  minSunHours: number | null;
  // Upstream drought_tolerant flag. Finer than the 3-bucket `watering` field;
  // shifts the soil pct comfort band so these species can dry further before
  // we warn. Null when the catalog row doesn't carry the flag.
  droughtTolerant: boolean | null;
}

function pickFirst(arr: unknown): string | null {
  if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') return arr[0];
  return null;
}

export async function findBestPerenualMatch(scientificName: string): Promise<PerenualHit | null> {
  if (!pool) return null;
  // raw_details_json holds the rich legacy schema (xSunlightDuration,
  // xTemperatureTolence, …); raw_details_v1_json only carries an id-only
  // stub for most species, so it's not useful for thresholds.
  const q = `
    SELECT id, common_name, scientific_name, family, watering, sunlight,
           default_image, raw_details_json
    FROM species
    WHERE scientific_name::text ILIKE $1
    ORDER BY
      CASE WHEN scientific_name::text ILIKE $2 THEN 0 ELSE 1 END,
      details_fetched DESC,
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
  const details = (r.raw_details_json ?? null) as Record<string, unknown> | null;
  return {
    id: r.id,
    scientificName: pickFirst(r.scientific_name) ?? scientificName,
    commonName: r.common_name ?? null,
    family: r.family ?? null,
    watering: r.watering ?? null,
    sunlight: Array.isArray(r.sunlight) ? r.sunlight : null,
    defaultImageUrl: di?.regular_url ?? di?.original_url ?? null,
    details,
    minSunHours: extractMinSunHours(details),
    droughtTolerant: extractDroughtTolerant(details),
  };
}

// Lightweight search by common or scientific name for the manual species
// picker on the identify screen. Returns a small typeahead-ready list of
// {scientificName, commonName, defaultImageUrl}. We search both common_name
// and the first element of scientific_name jsonb; case-insensitive, contains
// match. No threshold-extraction here — that happens later inside `resolve`.
export interface PerenualSearchHit {
  id: number;
  scientificName: string;
  commonName: string | null;
  defaultImageUrl: string | null;
}

export async function searchPerenual(query: string, limit = 20): Promise<PerenualSearchHit[]> {
  if (!pool) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const pattern = `%${q}%`;
  const sql = `
    SELECT id, common_name, scientific_name, default_image
    FROM species
    WHERE common_name ILIKE $1 OR scientific_name::text ILIKE $1
    ORDER BY
      CASE
        WHEN common_name ILIKE $2 THEN 0
        WHEN scientific_name::text ILIKE $2 THEN 1
        ELSE 2
      END,
      LENGTH(COALESCE(common_name, '')) ASC,
      id ASC
    LIMIT $3
  `;
  // Prefix-match gets ranked above contains-match.
  const prefix = `${q}%`;
  const { rows } = await pool.query(sql, [pattern, prefix, limit]);
  return rows.map((r) => {
    const di = r.default_image as { regular_url?: string; original_url?: string } | null;
    return {
      id: r.id,
      scientificName: pickFirst(r.scientific_name) ?? '',
      commonName: r.common_name ?? null,
      defaultImageUrl: di?.regular_url ?? di?.original_url ?? null,
    };
  }).filter((h) => h.scientificName.length > 0);
}

function extractMinSunHours(details: Record<string, unknown> | null): number | null {
  if (!details) return null;
  const dur = details.xSunlightDuration as { min?: unknown } | null | undefined;
  if (!dur || typeof dur !== 'object') return null;
  const raw = dur.min;
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  // Filter out the obvious garbage row (one species has min=2500).
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  return n;
}

// drought_tolerant arrives as a JSON boolean in most rows, occasionally as the
// strings "true"/"false". Anything else (missing, null) → null so callers can
// tell "not drought-tolerant" apart from "unknown".
function extractDroughtTolerant(details: Record<string, unknown> | null): boolean | null {
  if (!details) return null;
  const v = details.drought_tolerant;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
  }
  return null;
}
