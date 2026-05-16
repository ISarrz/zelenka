import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  type Device,
  type Measurement,
  type Plant,
  type RingStatus,
  type Severity,
  type User,
  type Verdict,
} from '../api';

type Status = 'loading' | 'unauth' | 'no-device' | 'no-data' | 'ready';

export function HomePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [, setUser] = useState<User | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [plant, setPlant] = useState<Plant | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

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
        setPlant(latest.plant);
        setMeasurement(latest.measurement);
        setVerdict(latest.verdict);
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

  const ringStatus: RingStatus = verdict?.ring ?? 'cold';
  const title = plant?.name ?? device?.name ?? 'Растение';
  const subtitle = plant?.species?.commonNameRu
    ?? plant?.species?.commonNameEn
    ?? plant?.species?.scientificName
    ?? (plant ? 'общий профиль' : null);

  return (
    <main className="min-h-full flex flex-col items-center justify-center p-6 gap-6">
      <Ring status={ringStatus} />
      <div className="text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-neutral-500 italic">{subtitle}</p>
        )}
      </div>

      {!plant && device && (
        <button
          onClick={() => navigate(`/devices/${device.id}/identify`)}
          className="rounded-full bg-status-ok text-white px-5 py-2 text-sm font-medium"
        >
          Опознать растение
        </button>
      )}

      <Grid m={measurement} v={verdict} />

      {status === 'no-data' && (
        <p className="text-sm text-neutral-500 text-center max-w-sm">
          Датчик ещё не присылал данные. Токен:&nbsp;
          <code className="select-all break-all">{device?.deviceToken}</code>
        </p>
      )}
    </main>
  );
}

function Ring({ status }: { status: RingStatus }) {
  const styles: Record<RingStatus, string> = {
    cold:  'border-status-cold border-dashed',
    ok:    'border-status-ok',
    warn:  'border-status-warn',
    alert: 'border-status-alert',
  };
  const labels: Record<RingStatus, string> = {
    cold:  'подождите 48 часов',
    ok:    'всё хорошо',
    warn:  'присмотритесь',
    alert: 'нужно действие',
  };
  return (
    <div
      className={`relative w-44 h-44 rounded-full border-[10px] flex items-center justify-center ${styles[status]}`}
    >
      <span className="text-sm text-neutral-500">{labels[status]}</span>
    </div>
  );
}

function Grid({ m, v }: { m: Measurement | null; v: Verdict | null }) {
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
      <Cell label="Темп." value={m?.temperatureC} unit="°C" sev={v?.perParam.temperatureC} />
      <Cell label="Влажность" value={m?.humidityPct} unit="%" sev={v?.perParam.humidityPct} />
      <Cell label="Свет" value={m?.lux} unit="lx" sev={v?.perParam.lux} />
      <Cell
        label="Почва"
        value={m?.soilMoisturePct ?? m?.soilMoistureRaw}
        unit={m?.soilMoisturePct == null ? 'raw' : '%'}
        sev={v?.perParam.soilMoistureRaw}
      />
    </div>
  );
}

function Cell({
  label, value, unit, sev,
}: {
  label: string; value: number | null | undefined; unit: string; sev: Severity | undefined;
}) {
  const display = value == null
    ? '—'
    : Number.isInteger(value) ? value.toString() : value.toFixed(1);
  const borderClass = sev === 'alert'
    ? 'border-status-alert'
    : sev === 'warn'
    ? 'border-status-warn'
    : sev === 'ok'
    ? 'border-status-ok/40'
    : 'border-neutral-200 dark:border-neutral-800';
  return (
    <div className={`rounded-2xl border-2 p-4 ${borderClass}`}>
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
