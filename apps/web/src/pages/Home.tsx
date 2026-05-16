import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Device, type Measurement, type User } from '../api';

type Status = 'loading' | 'unauth' | 'no-device' | 'no-data' | 'ready';

export function HomePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [, setUser] = useState<User | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const me = await api.me();
        if (cancelled) return;
        setUser(me.user);
        const list = await api.listDevices();
        if (cancelled) return;
        if (list.devices.length === 0) {
          setStatus('no-device');
          return;
        }
        const d = list.devices[0];
        setDevice(d);
        const latest = await api.latestMeasurement(d.id);
        if (cancelled) return;
        setMeasurement(latest.measurement);
        setStatus(latest.measurement ? 'ready' : 'no-data');
      } catch (err) {
        const code = (err as { status?: number }).status;
        if (code === 401) {
          if (!cancelled) navigate('/auth', { replace: true });
        } else if (!cancelled) {
          setStatus('no-data');
        }
      }
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [navigate]);

  if (status === 'loading') {
    return (
      <main className="min-h-full flex items-center justify-center">
        <p className="text-neutral-500">Загружаем…</p>
      </main>
    );
  }

  if (status === 'no-device') {
    return <NoDevicePrompt onCreated={(d) => { setDevice(d); setStatus('no-data'); }} />;
  }

  return (
    <main className="min-h-full flex flex-col items-center justify-center p-6 gap-6">
      <Ring />
      <h1 className="text-xl font-semibold">{device?.name ?? 'Растение'}</h1>
      <Grid m={measurement} />
      {status === 'no-data' && (
        <p className="text-sm text-neutral-500">
          Датчик ещё не присылал данные. Token:{' '}
          <code className="select-all">{device?.deviceToken}</code>
        </p>
      )}
    </main>
  );
}

function Ring() {
  // Sprint 0 placeholder — dashed cold-start ring.
  return (
    <div className="relative w-44 h-44 rounded-full border-[10px] border-dashed border-status-cold flex items-center justify-center">
      <span className="text-status-cold text-sm">подождите 48 часов</span>
    </div>
  );
}

function Grid({ m }: { m: Measurement | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
      <Cell label="Темп." value={m?.temperatureC} unit="°C" />
      <Cell label="Влажность" value={m?.humidityPct} unit="%" />
      <Cell label="Свет" value={m?.lux} unit="lx" />
      <Cell label="Почва" value={m?.soilMoisturePct ?? m?.soilMoistureRaw} unit={m?.soilMoisturePct == null ? 'raw' : '%'} />
    </div>
  );
}

function Cell({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  const display = value == null ? '—' : Number.isInteger(value) ? value.toString() : value.toFixed(1);
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {display}
        <span className="text-base font-normal text-neutral-500 ml-1">{unit}</span>
      </div>
    </div>
  );
}

function NoDevicePrompt({ onCreated }: { onCreated: (d: Device) => void }) {
  const [name, setName] = useState('Фикус');
  const [pending, setPending] = useState(false);

  const create = async () => {
    setPending(true);
    try {
      const { device } = await api.createDevice(name);
      onCreated(device);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Добавить растение</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Создайте запись — на следующем шаге получите токен, который вводится в датчик.
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2"
        />
        <button
          onClick={create}
          disabled={pending || !name.trim()}
          className="w-full rounded-lg bg-status-ok text-white py-2 font-medium disabled:opacity-50"
        >
          {pending ? 'Создаём…' : 'Создать'}
        </button>
      </div>
    </main>
  );
}
