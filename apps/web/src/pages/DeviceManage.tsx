import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  api,
  type BatteryStatus,
  type Plant,
} from '../api';
import { BackButton } from '../components/BackButton';
import { BatteryIndicator, batteryLabel } from '../components/BatteryIndicator';
import { ConfirmDialog } from '../components/ConfirmDialog';

// Screen per docs/design-summary.html §device-management. Title = 4-char
// uppercase prefix of Device.id ("A4F2"-style). Action set: re-pair Wi-Fi
// (offline instructions), unlink (DELETE with confirm).

interface Info {
  device: {
    id: string;
    name: string;
    firmwareVersion: string | null;
    wifiRssi: number | null;
    lastSeenAt: string | null;
  };
  plant: Plant | null;
  battery: BatteryStatus | null;
}

function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 4).toUpperCase();
}

function rssiLabel(rssi: number | null): { label: string; aux: string } | null {
  if (rssi == null) return null;
  if (rssi >= -60) return { label: 'отличный', aux: `${rssi} dBm` };
  if (rssi >= -75) return { label: 'хороший', aux: `${rssi} dBm` };
  return { label: 'слабый', aux: `${rssi} dBm` };
}

function freshnessLabel(lastSeenAt: string | null): { hero: string; sub: string } {
  if (!lastSeenAt) return { hero: 'Ждём данные', sub: 'датчик ещё не присылал замеры' };
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  const ageMin = ageMs / 60000;
  if (ageMin < 15) {
    const text = ageMin < 1 ? 'меньше минуты назад' : `${Math.round(ageMin)} мин. назад`;
    return { hero: 'На связи', sub: `последние данные ${text}` };
  }
  if (ageMin < 60) return { hero: 'На связи', sub: `${Math.round(ageMin)} мин. без замеров` };
  const ageH = Math.round(ageMin / 60);
  if (ageH < 24) return { hero: 'Не на связи', sub: `${ageH} ч. без замеров` };
  const ageD = Math.round(ageH / 24);
  return { hero: 'Не на связи', sub: `${ageD} дн. без замеров` };
}

export function DeviceManagePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [latestFw, setLatestFw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairQueueing, setRepairQueueing] = useState(false);
  const [repairQueued, setRepairQueued] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [latest, manifest] = await Promise.all([
          api.latestMeasurement(id),
          api.firmwareManifest().catch(() => null),
        ]);
        if (cancelled) return;
        setInfo({ device: latest.device, plant: latest.plant, battery: latest.battery });
        setLatestFw(manifest?.version ?? null);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) navigate('/auth', { replace: true });
        else if (status === 404) setError('Датчик не найден');
        else setError('Не удалось загрузить');
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id, navigate]);

  if (error) {
    return (
      <main className="min-h-full flex items-center justify-center p-6 text-neutral-500">
        {error}
      </main>
    );
  }
  if (!info) {
    return (
      <main className="min-h-full flex items-center justify-center p-6 text-neutral-500">
        Загружаем…
      </main>
    );
  }

  const idLabel = shortId(info.device.id);
  const fresh = freshnessLabel(info.device.lastSeenAt);
  const isOnline = fresh.hero === 'На связи';
  const rssi = rssiLabel(info.device.wifiRssi);
  const fwUpToDate =
    info.device.firmwareVersion && latestFw && info.device.firmwareVersion === latestFw;
  const fwUpdateAvailable =
    info.device.firmwareVersion && latestFw && info.device.firmwareVersion !== latestFw;

  const heroSub = info.plant?.name
    ? `в горшке с «${info.plant.name}» · ${fresh.sub}`
    : fresh.sub;

  const handleUnlink = async () => {
    if (!id) return;
    setUnlinking(true);
    try {
      await api.deleteDevice(id);
      navigate('/', { replace: true });
    } catch {
      setUnlinking(false);
      setUnlinkOpen(false);
      setError('Не удалось отвязать');
    }
  };

  const handleQueueRepair = async () => {
    if (!id) return;
    setRepairQueueing(true);
    try {
      await api.factoryResetDevice(id);
      setRepairQueued(true);
    } catch {
      setError('Не удалось поставить сброс в очередь');
      setRepairOpen(false);
    } finally {
      setRepairQueueing(false);
    }
  };

  const closeRepair = () => {
    setRepairOpen(false);
    // Reset queued state after the user closes — otherwise re-opening shows
    // a stale "Запрос отправлен" before they've done anything.
    setTimeout(() => setRepairQueued(false), 200);
  };

  return (
    <main className="min-h-full bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <BackButton />
        <div className="flex-1 text-base font-medium">Датчик {idLabel}</div>
      </div>

      {/* Hero */}
      <div className="flex items-center gap-4 px-5 py-5">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
          isOnline ? 'bg-status-ok/10 text-status-ok' : 'bg-status-alert/10 text-status-alert'
        }`}>
          📡
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-medium">{fresh.hero}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{heroSub}</div>
        </div>
      </div>

      {/* Состояние section */}
      <SectionLabel>Состояние</SectionLabel>

      {info.battery && (
        <Row
          icon={<BatteryIndicator estimate={info.battery.estimate} className="h-4 w-auto" />}
          title="Аккумулятор"
          subtitle={`${info.battery.voltage.toFixed(2)} В`}
          trailing={<span className="text-sm font-medium">{batteryLabel(info.battery.estimate)}</span>}
        />
      )}

      {rssi && (
        <Row
          icon={<span className="text-xl text-neutral-500">📶</span>}
          title="Сигнал Wi-Fi"
          subtitle={rssi.label}
          trailing={<span className="text-xs text-neutral-500">{rssi.aux}</span>}
        />
      )}

      {info.device.firmwareVersion && (
        <Row
          icon={<span className="text-xl text-neutral-500">⚙</span>}
          title="Прошивка"
          subtitle={
            fwUpToDate
              ? `${info.device.firmwareVersion} — актуальная версия`
              : fwUpdateAvailable
                ? `${info.device.firmwareVersion} — доступна ${latestFw}, обновится сама`
                : info.device.firmwareVersion
          }
          trailing={fwUpToDate ? <span className="text-status-ok text-lg">✓</span> : null}
        />
      )}

      {/* Подключение */}
      <SectionLabel>Подключение</SectionLabel>
      <button
        onClick={() => setRepairOpen(true)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
      >
        <span className="text-xl text-neutral-500 flex-shrink-0">↻</span>
        <div className="flex-1">
          <div className="text-sm">Переподключить к другому Wi-Fi</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            если сменили роутер или переехали
          </div>
        </div>
        <span className="text-neutral-400">›</span>
      </button>

      {/* Удаление */}
      <SectionLabel>Удаление</SectionLabel>

      <div className="border-t border-neutral-200 dark:border-neutral-800 mt-2">
        <button
          onClick={() => setUnlinkOpen(true)}
          className="w-full px-5 py-5 text-center text-sm text-status-alert"
        >
          Отвязать датчик
        </button>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={unlinkOpen}
        tone="danger"
        iconSlot={<span className="text-2xl">🗑</span>}
        title={`Отвязать датчик ${idLabel}?`}
        body={
          info.plant
            ? `Вся история показаний и событий «${info.plant.name}» пропадёт. Датчик отвяжется — его можно будет настроить заново.`
            : 'Вся история показаний пропадёт. Датчик отвяжется — его можно будет настроить заново.'
        }
        primaryLabel="Отвязать"
        onConfirm={handleUnlink}
        onCancel={() => setUnlinkOpen(false)}
        pending={unlinking}
      />

      <ConfirmDialog
        open={repairOpen}
        tone="neutral"
        iconSlot={<span className="text-2xl">↻</span>}
        title={repairQueued ? 'Запрос отправлен' : 'Переподключить к Wi-Fi'}
        body={repairQueued ? (
          <div className="text-left text-[13px] leading-relaxed">
            Датчик перейдёт в режим настройки на следующем цикле передачи данных — обычно в течение часа.
            В Wi-Fi появится сеть «Zelenka-{idLabel}», подключитесь к ней и пройдите шаги заново.
          </div>
        ) : (
          <div className="text-left text-[13px] leading-relaxed space-y-3">
            <p>
              Самый простой путь — отправить датчику команду по сети. На следующем цикле передачи (обычно в течение часа) он сам перейдёт в режим настройки и поднимет Wi-Fi «Zelenka-{idLabel}».
            </p>
            <details className="text-[12px] text-neutral-500 dark:text-neutral-400">
              <summary className="cursor-pointer">Если датчик совсем не на связи</summary>
              <p className="mt-2 leading-relaxed">
                Команда дойдёт до датчика, только когда он выйдет на связь. Если он давно молчит, оставьте его подключённым к питанию: после нескольких неудачных попыток подключения датчик сам перейдёт в режим настройки и поднимет сеть «Zelenka-{idLabel}». Не появилась — напишите в поддержку.
              </p>
            </details>
          </div>
        )}
        primaryLabel={repairQueued ? 'Понятно' : 'Отправить команду'}
        cancelLabel="Закрыть"
        onConfirm={repairQueued ? closeRepair : handleQueueRepair}
        onCancel={closeRepair}
        pending={repairQueueing}
      />
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-4 pb-2 text-[11px] font-medium tracking-wider uppercase text-neutral-400 dark:text-neutral-500 border-t border-neutral-200 dark:border-neutral-800 mt-2">
      {children}
    </div>
  );
}

function Row({
  icon,
  title,
  subtitle,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  trailing: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm">{title}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{subtitle}</div>
      </div>
      {trailing}
    </div>
  );
}
