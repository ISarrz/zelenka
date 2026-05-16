// Minimal API client. Always sends cookies (session lives in HttpOnly cookie).

const json = async (res: Response) => {
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? res.json() : res.text();
};

const base = '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
export interface Device { id: string; name: string; createdAt: string; deviceToken: string; }
export interface Measurement {
  id: string;
  measuredAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  lux: number | null;
  soilMoistureRaw: number | null;
  soilMoisturePct: number | null;
}

export const api = {
  requestMagicLink: (email: string) =>
    request<{ status: string }>('/auth/magic-link/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
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
    request<{ device: { id: string; name: string }; measurement: Measurement | null }>(
      `/devices/${deviceId}/latest`,
    ),
};
