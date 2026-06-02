// Minimal API client. Always sends cookies (session lives in HttpOnly cookie).

const json = async (res: Response) => {
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? res.json() : res.text();
};

const base = '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = init.body instanceof FormData;
  // Only declare JSON content-type when we actually carry a JSON body —
  // Fastify rejects 'application/json' with an empty body as a 400.
  const hasJsonBody = init.body != null && !isFormData;
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await json(res);
  if (!res.ok) {
    const err = new Error(typeof body === 'string' ? body : body?.error ?? 'request failed');
    (err as unknown as { status: number }).status = res.status;
    throw err;
  }
  return body as T;
}

export interface User { id: string; email: string; }

export interface PlantSpecies {
  id: string;
  scientificName: string;
  commonNameRu: string | null;
  commonNameEn: string | null;
  defaultImageUrl: string | null;
  family: string | null;
  description: string | null;
  // CareThresholds blob; shape varies, accessed loosely.
  thresholds?: Record<string, Record<string, number> | undefined> | null;
}

export interface Plant {
  id: string;
  name: string;
  photoUrl: string | null;
  speciesId: string | null;
  species: PlantSpecies | null;
  identifiedAt: string | null;
  lastRingStatus: string | null;
}

export interface Device {
  id: string;
  name: string;
  createdAt: string;
  deviceToken: string;
  plant?: Plant | null;
}

export interface Measurement {
  id: string;
  measuredAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  lux: number | null;
  soilMoistureRaw: number | null;
  soilMoisturePct: number | null;
  batteryRaw: number | null;
  batteryMv: number | null;
  wifiRssi: number | null;
}

export interface FeedItem {
  id: string;
  source: 'care' | 'push';
  kind: string;
  occurredAt: string;
  plantId: string;
  plantName: string;
  deviceId: string | null;
  body: string | null;
  careSource: 'manual' | 'auto' | null;
}

export type BatteryEstimate = 'full' | 'mid' | 'low' | 'critical';

export interface BatteryStatus {
  raw: number | null;
  mv: number | null;
  voltage: number;
  estimate: BatteryEstimate;
  cyclesSinceLastCharge: number;
  cyclesPerFullBattery: number | null;
  daysUntilCritical: number | null;
  lastChargeAt: string | null;
  calibrated: boolean;
}

export type Severity = 'ok' | 'warn' | 'alert' | 'unknown';
export type RingStatus = 'cold' | 'ok' | 'warn' | 'alert';

export interface Verdict {
  ring: RingStatus;
  perParam: {
    temperatureC: Severity;
    humidityPct: Severity;
    lux: Severity;
    soilMoistureRaw: Severity;
  };
}

export interface IdSuggestion {
  scientificName: string;
  probability: number;
  similarImageUrl: string | null;
}

export interface SpeciesSearchHit {
  id: number;
  scientificName: string;
  commonName: string | null;
  defaultImageUrl: string | null;
}

export const api = {
  requestMagicLink: (email: string, next?: string) =>
    request<{ status: string }>('/auth/magic-link/request', {
      method: 'POST',
      body: JSON.stringify(next ? { email, next } : { email }),
    }),
  claimDevice: (token: string) =>
    request<{ device: Device }>('/devices/claim', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  setSoilCalibration: (deviceId: string, body: { dryRaw?: number; wetRaw?: number }) =>
    request<{ device: Device }>(`/devices/${deviceId}/calibration`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  renamePlant: (deviceId: string, name: string) =>
    request<{ plant: Plant }>(`/devices/${deviceId}/rename-plant`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  consumeMagicLink: (token: string) =>
    request<{ user: User }>('/auth/magic-link/consume', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  logout: () => request<{ status: string }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/me'),
  listDevices: () => request<{ devices: Device[] }>('/devices'),
  createDevice: (name: string) =>
    request<{ device: Device }>('/devices', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  latestMeasurement: (deviceId: string) =>
    request<{
      device: {
        id: string;
        name: string;
        firmwareVersion: string | null;
        wifiRssi: number | null;
        lastSeenAt: string | null;
        soilDryRaw: number | null;
        soilWetRaw: number | null;
      };
      plant: Plant | null;
      lastWateringAt: string | null;
      measurement: Measurement | null;
      verdict: Verdict | null;
      thresholds: Record<string, Record<string, number> | undefined>;
      battery: BatteryStatus | null;
    }>(`/devices/${deviceId}/latest`),
  deleteDevice: (deviceId: string) =>
    request<null>(`/devices/${deviceId}`, { method: 'DELETE' }),
  replaceDevice: (deviceId: string) =>
    request<{ device: Device }>(`/devices/${deviceId}/replace`, { method: 'POST' }),
  factoryResetDevice: (deviceId: string) =>
    request<{ status: string }>(`/devices/${deviceId}/factory-reset`, { method: 'POST' }),
  firmwareManifest: () =>
    request<{ version: string; url: string; sha256: string; size: number; notes: string | null }>(
      '/firmware/manifest.json',
    ),
  feed: () => request<{ items: FeedItem[] }>('/feed'),
  identify: (image: File) => {
    const fd = new FormData();
    fd.append('image', image);
    return request<{
      suggestions: IdSuggestion[];
      quota: { used: number; limit: number; windowDays: number };
    }>('/plants/identify', { method: 'POST', body: fd });
  },
  resolveSpecies: (scientificName: string) =>
    request<{ species: PlantSpecies }>('/plants/species/resolve', {
      method: 'POST',
      body: JSON.stringify({ scientificName }),
    }),
  searchSpecies: (q: string) =>
    request<{ hits: SpeciesSearchHit[] }>(
      `/plants/species/search?q=${encodeURIComponent(q)}`,
    ),
  bindPlant: (
    deviceId: string,
    body: { speciesId: string | null; name: string; photoUrl?: string | null },
  ) =>
    request<{ plant: Plant }>(`/devices/${deviceId}/bind-plant`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  vapidPublicKey: () => request<{ key: string | null }>('/push/vapid-public-key'),
  pushSubscribe: (sub: PushSubscriptionJSON) =>
    request<{ id: string }>('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(sub),
    }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ status: string }>('/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    }),
  pushTest: () =>
    request<{ delivered: number; removed: number }>('/push/test', { method: 'POST' }),
  measurements: (deviceId: string, days: number) =>
    request<{ samples: Measurement[]; downsampled: boolean }>(
      `/devices/${deviceId}/measurements?days=${days}`,
    ),
  events: (plantId: string) =>
    request<{ events: CareEvent[] }>(`/plants/${plantId}/events`),
  addEvent: (plantId: string, body: { kind: CareEvent['kind']; occurredAt?: string; note?: string | null }) =>
    request<{ event: CareEvent }>(`/plants/${plantId}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteEvent: (plantId: string, eventId: string) =>
    request<{ status: string }>(`/plants/${plantId}/events/${eventId}`, {
      method: 'DELETE',
    }),
  meSettings: () => request<{ user: SettingsUser }>('/me/settings'),
  updateSettings: (body: Partial<Pick<SettingsUser, 'timezone' | 'quietHoursStartMin' | 'quietHoursEndMin'>>) =>
    request<{ user: SettingsUser }>('/me/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

export interface SettingsUser {
  id: string;
  email: string;
  timezone: string;
  quietHoursStartMin: number | null;
  quietHoursEndMin: number | null;
}

export interface CareEvent {
  id: string;
  kind: 'water' | 'fertilize' | 'repot' | 'moved' | 'other';
  occurredAt: string;
  note: string | null;
  source: 'auto' | 'manual';
}
