import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  type BatteryStatus,
  type Device,
  type Measurement,
  type Plant,
  type RingStatus,
  type Severity,
  type User,
  type Verdict,
} from '../api';
import { BatteryIndicator, batteryLabel } from '../components/BatteryIndicator';
import {
  isPushSupported,
  isStandalonePWA,
  subscribeToPush,
} from '../lib/push';
import {
  IOSInstallPrompt,
  shouldShowIOSInstall,
} from '../components/IOSInstallPrompt';

type Status = 'loading' | 'no-device' | 'no-data' | 'ready';
const ACTIVE_KEY = 'zelenka_active_device';

export function HomePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [, setUser] = useState<User | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null,
  );
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iosPromptOpen, setIosPromptOpen] = useState(() => shouldShowIOSInstall());

  // List devices once; pick a sensible active id; keep the list in state.
  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((me) => { if (!cancelled) setUser(me.user); })
      .catch((err) => {
        if ((err as { status?: number }).status === 401) navigate('/auth', { replace: true });
      });

    const reloadList = async () => {
      try {
        const list = await api.listDevices();
        if (cancelled) return;
        setDevices(list.devices);
        if (list.devices.length === 0) {
          setStatus('no-device');
          setActiveId(null);
          return;
        }
        const known = activeId && list.devices.find((d) => d.id === activeId);
        const next = known ? activeId : list.devices[0].id;
        if (next !== activeId) {
          setActiveId(next);
          localStorage.setItem(ACTIVE_KEY, next);
        }
      } catch (err) {
        if ((err as { status?: number }).status === 401) navigate('/auth', { replace: true });
      }
    };
    reloadList();
    return () => { cancelled = true; };
  }, [navigate, activeId]);

  // Per-active-device polling for latest measurement.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const latest = await api.latestMeasurement(activeId);
        if (cancelled) return;
        setMeasurement(latest.measurement);
        setVerdict(latest.verdict);
        setBattery(latest.battery);
        setStatus(latest.measurement ? 'ready' : 'no-data');
      } catch (err) {
        const code = (err as { status?: number }).status;
        if (code === 401) navigate('/auth', { replace: true });
      }
    };
    poll();
    const interval = setInterval(poll, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeId, navigate]);

  if (status === 'loading') {
    return (
      <main className="min-h-full flex items-center justify-center">
        <p className="text-neutral-500">Загружаем…</p>
      </main>
    );
  }

  if (status === 'no-device') {
    return <NoDevicePrompt onCreated={(d) => {
      setDevices([d]);
      setActiveId(d.id);
      localStorage.setItem(ACTIVE_KEY, d.id);
      setStatus('no-data');
    }} />;
  }

  const device = devices.find((d) => d.id === activeId) ?? devices[0];
  const plant: Plant | null = device.plant ?? null;
  const ringStatus: RingStatus = verdict?.ring ?? 'cold';
  const title = plant?.name ?? device.name;
  const subtitle = plant?.species?.commonNameRu
    ?? plant?.species?.commonNameEn
    ?? plant?.species?.scientificName
    ?? (plant ? 'общий профиль' : null);

  return (
    <main className="relative min-h-full flex flex-col items-center justify-center p-6 gap-6">
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {battery && (
          <button
            onClick={() => navigate(`/devices/${device.id}/manage`)}
            title={`Заряд: ${batteryLabel(battery.estimate)} (${battery.voltage.toFixed(2)} В) — открыть управление датчиком`}
            aria-label="Управление датчиком"
            className="inline-flex items-center p-1"
          >
            <BatteryIndicator estimate={battery.estimate} className="h-3.5 w-auto" />
          </button>
        )}
        <button
          onClick={() => navigate('/settings')}
          aria-label="Настройки"
          className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 p-2"
        >⚙</button>
      </div>

      <PlantSwitcher
        devices={devices}
        activeId={device.id}
        title={title}
        subtitle={subtitle}
        onOpen={() => setPickerOpen(true)}
      />

      <Ring
        status={ringStatus}
        photoUrl={plant?.species?.defaultImageUrl ?? null}
        fallbackLetter={(plant?.name ?? device.name).trim().charAt(0).toUpperCase()}
      />

      <button
        onClick={() => navigate(`/devices/${device.id}`)}
        className="text-xs text-status-ok underline"
      >
        Графики и журнал →
      </button>

      {!plant && (
        <button
          onClick={() => navigate(`/devices/${device.id}/identify`)}
          className="rounded-full bg-status-ok text-white px-5 py-2 text-sm font-medium"
        >
          Опознать растение
        </button>
      )}

      <PushControl />

      <Grid m={measurement} v={verdict} deviceId={device.id} />

      {status === 'no-data' && (
        <p className="text-sm text-neutral-500 text-center max-w-sm">
          Датчик ещё не присылал данные. Токен:&nbsp;
          <code className="select-all break-all">{device.deviceToken}</code>
        </p>
      )}

      {iosPromptOpen && <IOSInstallPrompt onClose={() => setIosPromptOpen(false)} />}

      {pickerOpen && (
        <PlantPicker
          devices={devices}
          activeId={device.id}
          onPick={(id) => {
            setActiveId(id);
            localStorage.setItem(ACTIVE_KEY, id);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
          onAdded={(d) => {
            setDevices((arr) => [d, ...arr]);
            setActiveId(d.id);
            localStorage.setItem(ACTIVE_KEY, d.id);
            setPickerOpen(false);
          }}
        />
      )}
    </main>
  );
}

function PlantSwitcher({
  devices, activeId, title, subtitle, onOpen,
}: {
  devices: Device[];
  activeId: string;
  title: string;
  subtitle: string | null;
  onOpen: () => void;
}) {
  if (devices.length <= 1) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-neutral-500 italic">{subtitle}</p>}
      </div>
    );
  }
  const idx = devices.findIndex((d) => d.id === activeId);
  return (
    <button onClick={onOpen} className="text-center flex flex-col items-center gap-1">
      <span className="text-xl font-semibold inline-flex items-center gap-1">
        {title}
        <span className="text-neutral-400" aria-hidden>▾</span>
      </span>
      {subtitle && <span className="text-sm text-neutral-500 italic">{subtitle}</span>}
      <span className="flex gap-1.5 mt-1">
        {devices.map((d, i) => (
          <span
            key={d.id}
            className={`block w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-neutral-700 dark:bg-neutral-200' : 'bg-neutral-300 dark:bg-neutral-700'}`}
          />
        ))}
      </span>
    </button>
  );
}

function Ring({
  status, photoUrl, fallbackLetter,
}: {
  status: RingStatus;
  photoUrl: string | null;
  fallbackLetter: string;
}) {
  const styles: Record<RingStatus, string> = {
    cold:  'border-status-cold border-dashed',
    ok:    'border-status-ok',
    warn:  'border-status-warn',
    alert: 'border-status-alert',
  };
  return (
    <div
      className={`relative w-48 h-48 rounded-full border-[10px] flex items-center justify-center overflow-hidden ${styles[status]}`}
      aria-label={`Состояние: ${status}`}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
          <span className="text-5xl font-light text-neutral-400">{fallbackLetter}</span>
        </div>
      )}
    </div>
  );
}

function Grid({ m, v, deviceId }: { m: Measurement | null; v: Verdict | null; deviceId: string }) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
      <Cell
        label="Темп." value={m?.temperatureC} unit="°C"
        sev={v?.perParam.temperatureC}
        onClick={() => navigate(`/devices/${deviceId}/p/temperature`)}
      />
      <Cell
        label="Влажность" value={m?.humidityPct} unit="%"
        sev={v?.perParam.humidityPct}
        onClick={() => navigate(`/devices/${deviceId}/p/humidity`)}
      />
      <Cell
        label="Свет" value={m?.lux} unit="lx"
        sev={v?.perParam.lux}
        onClick={() => navigate(`/devices/${deviceId}/p/light`)}
      />
      <Cell
        label="Почва"
        value={m?.soilMoisturePct ?? m?.soilMoistureRaw}
        unit={m?.soilMoisturePct == null ? 'raw' : '%'}
        sev={v?.perParam.soilMoistureRaw}
        onClick={() => navigate(`/devices/${deviceId}/p/soil`)}
      />
    </div>
  );
}

function Cell({
  label, value, unit, sev, onClick,
}: {
  label: string; value: number | null | undefined; unit: string;
  sev: Severity | undefined; onClick: () => void;
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
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-left active:scale-[0.98] transition-transform ${borderClass}`}
    >
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {display}
        <span className="text-base font-normal text-neutral-500 ml-1">{unit}</span>
      </div>
    </button>
  );
}

function statusDotClass(s: RingStatus | string | null | undefined): string {
  switch (s) {
    case 'ok':    return 'bg-status-ok';
    case 'warn':  return 'bg-status-warn';
    case 'alert': return 'bg-status-alert';
    case 'cold':
    default:      return 'bg-status-cold';
  }
}

function PlantPicker({
  devices, activeId, onPick, onClose, onAdded,
}: {
  devices: Device[];
  activeId: string;
  onPick: (id: string) => void;
  onClose: () => void;
  onAdded: (d: Device) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-sm p-3 space-y-1"
      >
        <h3 className="font-semibold px-2 pt-1 pb-2 text-sm text-neutral-500">Растения</h3>
        <ul>
          {devices.map((d) => {
            const isActive = d.id === activeId;
            const name = d.plant?.name ?? d.name;
            const sub = d.plant?.species?.commonNameRu
              ?? d.plant?.species?.commonNameEn
              ?? d.plant?.species?.scientificName
              ?? (d.plant ? 'общий профиль' : 'нет растения');
            const photo = d.plant?.species?.defaultImageUrl;
            const dot = statusDotClass(d.plant?.lastRingStatus);
            return (
              <li key={d.id}>
                <button
                  onClick={() => onPick(d.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left ${isActive ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
                >
                  <span className="relative shrink-0">
                    {photo ? (
                      <img src={photo} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-neutral-900 ${dot}`} />
                  </span>
                  <span className="flex-1">
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-neutral-500 italic">{sub}</div>
                  </span>
                  {isActive && <span className="text-status-ok text-sm">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-neutral-200 dark:border-neutral-800 mt-2 pt-2">
          {addOpen ? (
            <AddDeviceInline
              onCreated={(d) => { setAddOpen(false); onAdded(d); }}
              onCancel={() => setAddOpen(false)}
            />
          ) : (
            <button
              onClick={() => setAddOpen(true)}
              className="w-full rounded-xl px-3 py-2 text-left text-sm text-status-ok"
            >+ Добавить растение</button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddDeviceInline({
  onCreated, onCancel,
}: {
  onCreated: (d: Device) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setPending(true);
    try {
      const { device } = await api.createDevice(name.trim());
      onCreated(device);
    } finally { setPending(false); }
  };
  return (
    <div className="space-y-2 px-1">
      <input
        autoFocus
        placeholder="Имя растения"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2"
      />
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 py-2 text-sm">Отмена</button>
        <button onClick={submit} disabled={pending || !name.trim()} className="flex-1 rounded-lg bg-status-ok text-white py-2 text-sm font-medium disabled:opacity-50">
          {pending ? 'Создаём…' : 'Создать'}
        </button>
      </div>
    </div>
  );
}

function PushControl() {
  const [state, setState] = useState<'idle' | 'pending' | 'on' | 'unsupported' | 'needs-pwa' | 'denied' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) { setState('unsupported'); return; }
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    if (isIOS && !isStandalonePWA()) { setState('needs-pwa'); return; }
    if (Notification.permission === 'granted') setState('on');
    else if (Notification.permission === 'denied') setState('denied');
  }, []);

  const enable = async () => {
    setState('pending');
    setError(null);
    try {
      const { key } = await api.vapidPublicKey();
      if (!key) throw new Error('сервер не настроен для push');
      const sub = await subscribeToPush(key);
      await api.pushSubscribe(sub.toJSON() as PushSubscriptionJSON);
      setState('on');
    } catch (err) {
      setError((err as Error).message);
      setState('error');
    }
  };

  const sendTest = async () => {
    try { await api.pushTest(); }
    catch (err) { setError((err as Error).message); }
  };

  if (state === 'unsupported') return null;
  if (state === 'needs-pwa') {
    return (
      <p className="text-sm text-neutral-500 text-center max-w-sm">
        Чтобы получать уведомления на iPhone, добавьте Zelenka на главный
        экран через значок «Поделиться».
      </p>
    );
  }
  if (state === 'on') {
    return (
      <button onClick={sendTest} className="text-sm text-status-ok underline">
        Прислать тестовое уведомление
      </button>
    );
  }
  if (state === 'denied') {
    return (
      <p className="text-sm text-neutral-500 text-center max-w-sm">
        Разрешите уведомления в настройках браузера, чтобы получать
        напоминания о поливе.
      </p>
    );
  }
  return (
    <div className="text-center space-y-1">
      <button
        onClick={enable}
        disabled={state === 'pending'}
        className="rounded-full bg-status-ok text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
      >
        {state === 'pending' ? 'Подключаем…' : 'Включить уведомления'}
      </button>
      {error && <p className="text-xs text-neutral-500">{error}</p>}
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
