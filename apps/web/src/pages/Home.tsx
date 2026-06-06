import { useEffect, useRef, useState } from 'react';
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
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { PlantArt } from '../components/PlantArt';
import {
  isPushSupported,
  isStandalonePWA,
  subscribeToPush,
} from '../lib/push';
import {
  InstallPrompt,
  shouldShowInstall,
} from '../components/InstallPrompt';

type Status = 'loading' | 'no-device' | 'no-data' | 'ready';
const ACTIVE_KEY = 'zelenka_active_device';
const SWIPE_HINT_SEEN_KEY = 'zelenka_swipe_hint_seen';
const SWIPE_MIN_DX = 60;
const SWIPE_MAX_DY = 40;

// Status palette mirrors tailwind.config.ts → status.* tokens. We need the
// raw hex for the solid ring background and per-cell border colours.
const RING_FILL: Record<RingStatus, string> = {
  ok:    '#639922',
  warn:  '#EF9F27',
  alert: '#E24B4A',
};
const SEV_BORDER: Record<Severity, string> = {
  ok:      '#639922',
  warn:    '#EF9F27',
  alert:   '#E24B4A',
  unknown: '#B4B2A9',
};
const SEV_ICON: Record<Severity, string> = {
  ok:      '#639922',
  warn:    '#BA7517',
  alert:   '#A52A29',
  unknown: '#888780',
};

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
  const [lastWateringAt, setLastWateringAt] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [wifiRssi, setWifiRssi] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [installPromptOpen, setInstallPromptOpen] = useState(() => shouldShowInstall() !== null);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (devices.length < 2) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SWIPE_HINT_SEEN_KEY)) return;
    setShowSwipeHint(true);
  }, [devices.length]);

  const switchByDelta = (delta: number) => {
    if (!activeId || devices.length < 2) return;
    const idx = devices.findIndex((d) => d.id === activeId);
    if (idx < 0) return;
    const next = idx + delta;
    if (next < 0 || next >= devices.length) return;
    const id = devices[next].id;
    setActiveId(id);
    if (typeof window !== 'undefined') localStorage.setItem(ACTIVE_KEY, id);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dy) > SWIPE_MAX_DY) return;
    switchByDelta(dx < 0 ? 1 : -1);
  };

  const dismissSwipeHint = () => {
    if (typeof window !== 'undefined') localStorage.setItem(SWIPE_HINT_SEEN_KEY, '1');
    setShowSwipeHint(false);
  };

  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((me) => { if (!cancelled) setUser(me.user); })
      .catch((err) => {
        if ((err as { status?: number }).status === 401) navigate('/landing', { replace: true });
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
        if ((err as { status?: number }).status === 401) navigate('/landing', { replace: true });
      }
    };
    reloadList();
    return () => { cancelled = true; };
  }, [navigate, activeId]);

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
        setLastWateringAt(latest.lastWateringAt);
        setLastSeenAt(latest.device.lastSeenAt);
        setWifiRssi(latest.device.wifiRssi);
        setStatus(latest.measurement ? 'ready' : 'no-data');
      } catch (err) {
        const code = (err as { status?: number }).status;
        if (code === 401) navigate('/landing', { replace: true });
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
      navigate(`/devices/${d.id}/setup`, { state: { device: d } });
    }} />;
  }

  const device = devices.find((d) => d.id === activeId) ?? devices[0];
  const plant: Plant | null = device.plant ?? null;
  // The backend ring already aggregates per-param severity (alert > warn > ok).
  const ringStatus: RingStatus = verdict?.ring ?? 'ok';
  const title = plant?.name ?? device.name;
  const headline = headlineFor(ringStatus, verdict);
  const lowBattery = battery && (battery.estimate === 'low' || battery.estimate === 'critical');

  return (
    <main
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="relative min-h-full pb-20 max-w-md mx-auto flex flex-col"
    >
      <Header
        onAdd={() => setAddOpen(true)}
        onPickPlant={() => devices.length > 1 && setPickerOpen(true)}
        onProfile={() => navigate('/settings')}
        onRename={() => { if (plant) setRenameOpen(true); }}
        title={title}
        showChevron={devices.length > 1}
      />

      {lowBattery && battery && (
        <button
          onClick={() => navigate(`/devices/${device.id}/manage`)}
          className="mx-4 mt-1 w-[calc(100%-2rem)] flex items-center gap-2 px-3 py-2 rounded-lg bg-status-warn/10 text-left"
        >
          <BatteryIndicator estimate={battery.estimate} className="h-3.5 w-auto shrink-0" />
          <span className="text-xs text-neutral-600 dark:text-neutral-300 flex-1">
            Заряд: {batteryLabel(battery.estimate).toLowerCase()}
          </span>
        </button>
      )}

      <Hero
        ringStatus={ringStatus}
        headline={headline}
        devices={devices}
        activeId={device.id}
        onOpenCharts={() => navigate(`/devices/${device.id}`)}
      />

      <div className="flex-1 min-h-[16px]" />

      <Grid
        m={measurement}
        v={verdict}
        deviceId={device.id}
      />

      <QuickStats
        lastWateringAt={lastWateringAt}
        lastSeenAt={lastSeenAt}
        battery={battery}
        wifiRssi={wifiRssi}
      />

      <div className="flex flex-col items-center gap-3 px-4">
        {!plant && (
          <button
            onClick={() => navigate(`/devices/${device.id}/identify`)}
            className="rounded-full bg-status-ok text-white px-5 py-2 text-sm font-medium"
          >
            Опознать растение
          </button>
        )}

        <PushControl />

        {status === 'no-data' && (
          <button
            onClick={() => navigate(`/devices/${device.id}/setup`, { state: { device } })}
            className="text-sm text-neutral-500 text-center max-w-sm underline-offset-2 hover:underline"
          >
            Датчик ещё не присылал данные — продолжить подключение
          </button>
        )}
      </div>

      {installPromptOpen && <InstallPrompt onClose={() => setInstallPromptOpen(false)} />}

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

      {addOpen && (
        <AddDeviceModal
          onClose={() => setAddOpen(false)}
          onCreated={(d) => {
            setDevices((arr) => [d, ...arr]);
            setActiveId(d.id);
            localStorage.setItem(ACTIVE_KEY, d.id);
            setAddOpen(false);
            navigate(`/devices/${d.id}/setup`, { state: { device: d } });
          }}
        />
      )}

      {renameOpen && plant && (
        <RenamePlantModal
          initial={plant.name}
          onClose={() => setRenameOpen(false)}
          onSubmit={async (name) => {
            try {
              await api.renamePlant(device.id, name);
              setDevices((arr) => arr.map((d) => d.id === device.id
                ? { ...d, plant: d.plant ? { ...d.plant, name } : d.plant }
                : d));
            } finally {
              setRenameOpen(false);
            }
          }}
        />
      )}

      <BottomNav active="plant" />
      {showSwipeHint && <SwipeHintOverlay onDismiss={dismissSwipeHint} />}
    </main>
  );
}

function headlineFor(ring: RingStatus, v: Verdict | null): string {
  if (ring === 'ok') return 'Всё хорошо';
  const soil = v?.perParam.soilMoistureRaw;
  const temp = v?.perParam.temperatureC;
  const lux  = v?.perParam.lux;
  if (ring === 'alert') {
    if (soil === 'alert') return 'Срочно полив';
    if (temp === 'alert') return 'Температура вне нормы';
    if (lux === 'alert')  return 'Темно';
    return 'Нужно внимание';
  }
  if (soil === 'warn' || soil === 'alert') return 'Нужен полив';
  if (temp === 'warn') return 'Жарко';
  if (lux === 'warn')  return 'Темно';
  return 'Условия не идеальны';
}

function Header({
  onAdd, onPickPlant, onProfile, onRename, title, showChevron,
}: {
  onAdd: () => void;
  onPickPlant: () => void;
  onProfile: () => void;
  onRename: () => void;
  title: string;
  showChevron: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <button
        onClick={onAdd}
        aria-label="Добавить датчик"
        className="w-11 h-11 rounded-full border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500 dark:text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-900"
      >
        <Icon name="plus" size={22} />
      </button>
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          onClick={onRename}
          aria-label="Переименовать растение"
          className="text-base font-medium truncate max-w-[180px]"
        >
          {title}
        </button>
        {showChevron && (
          <button onClick={onPickPlant} aria-label="Выбрать растение" className="text-neutral-500">
            <Icon name="chevron-down" size={16} />
          </button>
        )}
      </div>
      <button
        onClick={onProfile}
        aria-label="Профиль"
        className="w-11 h-11 rounded-full border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500 dark:text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-900"
      >
        <Icon name="user" size={22} />
      </button>
    </div>
  );
}

function Hero({
  ringStatus, headline, devices, activeId, onOpenCharts,
}: {
  ringStatus: RingStatus;
  headline: string;
  devices: Device[];
  activeId: string;
  onOpenCharts: () => void;
}) {
  const idx = devices.findIndex((d) => d.id === activeId);
  return (
    <div className="flex flex-col items-center px-4 pt-6 pb-3">
      <button
        onClick={onOpenCharts}
        aria-label="Графики и журнал"
        className="rounded-full focus:outline-none active:scale-[0.97] transition-transform"
      >
        <Ring status={ringStatus} />
      </button>
      <div className="mt-5 text-xl font-medium text-neutral-900 dark:text-neutral-100">
        {headline}
      </div>
      {devices.length > 1 && (
        <div className="flex gap-1.5 mt-2">
          {devices.map((d, i) => (
            <span
              key={d.id}
              className={`block w-1.5 h-1.5 rounded-full ${
                i === idx
                  ? 'bg-neutral-800 dark:bg-neutral-200'
                  : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QuickStats({
  lastWateringAt, lastSeenAt, battery, wifiRssi,
}: {
  lastWateringAt: string | null;
  lastSeenAt: string | null;
  battery: BatteryStatus | null;
  wifiRssi: number | null;
}) {
  return (
    <div className="px-4 pt-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-1.5 justify-items-center">
      <StatChip icon="droplet"     label="Полив"   value={formatAgoShort(lastWateringAt, 'never')} />
      <StatChip icon="broadcast"   label="Замер"   value={formatAgoShort(lastSeenAt, 'no-data')} />
      <StatChip icon="info-circle" label="Батарея" value={battery ? batteryLabel(battery.estimate) : '—'} />
      <StatChip icon="wifi"        label="Wi-Fi"   value={wifiRssi != null ? wifiQuality(wifiRssi) : '—'} />
    </div>
  );
}

function wifiQuality(rssi: number): string {
  if (rssi >= -50) return 'отлично';
  if (rssi >= -65) return 'хорошо';
  if (rssi >= -75) return 'средне';
  if (rssi >= -85) return 'слабо';
  return 'плохо';
}

function StatChip({ icon, label, value }: {
  icon: 'droplet' | 'broadcast' | 'info-circle' | 'wifi';
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">
      <Icon name={icon} size={14} className="shrink-0" />
      <span className="shrink-0">{label}</span>
      <span className="text-neutral-900 dark:text-neutral-100 font-medium tabular-nums truncate">{value}</span>
    </div>
  );
}

// Compact form for the inline chips above the sensor grid: "5 мин", "2 ч",
// "3 д" — no trailing "назад" so three chips fit on a phone width.
function formatAgoShort(iso: string | null, missingText: 'never' | 'no-data'): string {
  if (!iso) return missingText === 'never' ? '—' : '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'сейчас';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} мин`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} д`;
}

function Ring({ status }: { status: RingStatus }) {
  return (
    <div
      className="w-48 h-48 rounded-full p-[8px] flex items-center justify-center"
      style={{ backgroundColor: RING_FILL[status] }}
      aria-label={`Состояние: ${status}`}
    >
      <div className="w-full h-full rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
        <PlantArt className="w-[92px] h-auto text-neutral-700 dark:text-neutral-300" />
      </div>
    </div>
  );
}


function Grid({
  m, v, deviceId,
}: {
  m: Measurement | null;
  v: Verdict | null;
  deviceId: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-2 gap-3 px-4 pt-3 pb-3">
      <Cell
        icon="droplet" label="Почва"
        value={m?.soilMoisturePct ?? m?.soilMoistureRaw}
        unit={m?.soilMoisturePct == null ? '' : '%'}
        sev={v?.perParam.soilMoistureRaw}
        onClick={() => navigate(`/devices/${deviceId}/p/soil`)}
      />
      <Cell
        icon="sun" label="Свет"
        value={m?.lux} unit="лк"
        sev={v?.perParam.lux}
        formatThousands
        onClick={() => navigate(`/devices/${deviceId}/p/light`)}
      />
      <Cell
        icon="temperature" label="Температура"
        value={m?.temperatureC} unit="°C"
        sev={v?.perParam.temperatureC}
        onClick={() => navigate(`/devices/${deviceId}/p/temperature`)}
      />
      <Cell
        icon="mist" label="Воздух"
        value={m?.humidityPct} unit="%"
        sev={v?.perParam.humidityPct}
        onClick={() => navigate(`/devices/${deviceId}/p/humidity`)}
      />
    </div>
  );
}

function Cell({
  icon, label, value, unit, sev, formatThousands, onClick,
}: {
  icon: 'droplet' | 'sun' | 'temperature' | 'mist';
  label: string;
  value: number | null | undefined;
  unit: string;
  sev: Severity | undefined;
  formatThousands?: boolean;
  onClick: () => void;
}) {
  const display = value == null
    ? '—'
    : formatThousands && value >= 1000
      ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
      : Number.isInteger(value) ? value.toString() : value.toFixed(1);

  const severity: Severity = sev ?? 'ok';
  const borderColor = SEV_BORDER[severity];
  const iconColor = SEV_ICON[severity];

  return (
    <button
      onClick={onClick}
      className="rounded-2xl bg-neutral-50 dark:bg-neutral-900 px-4 py-4 text-left active:scale-[0.98] transition-transform border-[1.5px]"
      style={{ borderColor }}
    >
      <div className="flex items-center gap-2 text-[13px] text-neutral-500 dark:text-neutral-400">
        <Icon name={icon} size={18} style={{ color: iconColor }} />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[22px] font-medium tabular-nums">{display}</span>
        {value != null && unit && (
          <span className="text-[13px] text-neutral-500 dark:text-neutral-400">{unit}</span>
        )}
      </div>
    </button>
  );
}

function SwipeHintOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-6"
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 rounded-2xl max-w-xs w-full p-6 text-center"
        role="dialog"
        aria-modal="true"
      >
        <div className="text-3xl mb-2" aria-hidden>↔</div>
        <div className="text-base font-medium">Свайпните, чтобы переключиться</div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
          У вас два или больше растений. Проведите пальцем влево или вправо по главному экрану, чтобы перейти к следующему.
        </p>
        <button
          onClick={onDismiss}
          className="mt-5 w-full py-2.5 rounded-lg bg-status-ok text-white text-sm font-medium"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}

function ringBorderColor(s: RingStatus | string | null | undefined): string {
  switch (s) {
    case 'warn':  return '#EF9F27';
    case 'alert': return '#E24B4A';
    // cold/ok/null all render as ok-green now that cold-start is removed.
    default:      return '#639922';
  }
}

function ringHeadline(s: RingStatus | string | null | undefined): string {
  switch (s) {
    case 'warn':  return 'Нужен полив';
    case 'alert': return 'Нужно внимание';
    default:      return 'Всё хорошо';
  }
}

function RenamePlantModal({
  initial, onClose, onSubmit,
}: {
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-sm p-5 space-y-4"
      >
        <h2 className="text-lg font-medium">Название растения</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={64}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) {
            setPending(true); Promise.resolve(onSubmit(value.trim())).finally(() => setPending(false));
          } }}
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-status-ok"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 py-2 text-sm"
          >Отмена</button>
          <button
            onClick={() => {
              const trimmed = value.trim();
              if (!trimmed) return;
              setPending(true);
              Promise.resolve(onSubmit(trimmed)).finally(() => setPending(false));
            }}
            disabled={pending || !value.trim()}
            className="flex-1 rounded-lg bg-status-ok text-white py-2 text-sm font-medium disabled:opacity-50"
          >{pending ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
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
        <h3 className="font-medium px-2 pt-1 pb-2 text-sm text-neutral-500">Растения</h3>
        <ul>
          {devices.map((d) => {
            const isActive = d.id === activeId;
            const name = d.plant?.name ?? d.name;
            const sub = ringHeadline(d.plant?.lastRingStatus);
            const color = ringBorderColor(d.plant?.lastRingStatus);
            return (
              <li key={d.id}>
                <button
                  onClick={() => onPick(d.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left ${isActive ? 'bg-neutral-100 dark:bg-neutral-800' : ''}`}
                >
                  <span
                    className="shrink-0 w-10 h-10 rounded-full p-[2px] flex items-center justify-center"
                    style={{ backgroundColor: color }}
                  >
                    <span className="w-full h-full rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                      <PlantArt className="w-[18px] h-auto text-neutral-700 dark:text-neutral-300" strokeWidth={16} />
                    </span>
                  </span>
                  <span className="flex-1">
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-neutral-500">{sub}</div>
                  </span>
                  {isActive && (
                    <Icon name="check" size={17} className="text-neutral-900 dark:text-neutral-100" />
                  )}
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

function AddDeviceModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (d: Device) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-sm p-4"
      >
        <h3 className="font-medium pb-3 text-base">Добавить растение</h3>
        <AddDeviceInline onCreated={onCreated} onCancel={onClose} />
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

  if (state === 'unsupported') return null;
  if (state === 'on') return null;
  if (state === 'needs-pwa') {
    return (
      <p className="text-sm text-neutral-500 text-center max-w-sm">
        Чтобы получать уведомления на iPhone, добавьте Zeleno на главный
        экран через значок «Поделиться».
      </p>
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
