import { config } from '../config.js';

// Plant.id v3 identification client. The official endpoint accepts JSON with
// base64 images. We don't store the user's uploaded photo on disk — it goes
// straight to Plant.id and is forgotten.

export interface IdSuggestion {
  scientificName: string;
  probability: number;
  similarImageUrl?: string | null;
}

export interface IdResult {
  suggestions: IdSuggestion[];
  raw: unknown;
}

interface PlantIdV3Response {
  result?: {
    classification?: {
      suggestions?: Array<{
        name?: string;
        probability?: number;
        similar_images?: Array<{ url?: string; url_small?: string }>;
      }>;
    };
  };
}

export async function identifyPlant(images: Buffer[]): Promise<IdResult> {
  if (!config.plantIdApiKey) {
    throw new Error('PLANT_ID_API_KEY is not configured');
  }
  if (images.length === 0 || images.length > 3) {
    throw new Error('Plant.id accepts 1–3 images per request');
  }

  const body = {
    images: images.map((b) => `data:image/jpeg;base64,${b.toString('base64')}`),
    similar_images: true,
  };

  const res = await fetch('https://plant.id/api/v3/identification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': config.plantIdApiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Plant.id ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as PlantIdV3Response;
  const raw = json;
  const suggestions = (json.result?.classification?.suggestions ?? [])
    .slice(0, 3)
    .map((s) => ({
      scientificName: s.name ?? '',
      probability: s.probability ?? 0,
      similarImageUrl: s.similar_images?.[0]?.url_small ?? s.similar_images?.[0]?.url ?? null,
    }))
    .filter((s) => s.scientificName);

  return { suggestions, raw };
}
