import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type Device } from '../api';
import { Icon } from '../components/Icon';
import { PlantArt } from '../components/PlantArt';

// Onboarding for a freshly created (or replacement) device. Follows the
// frames in docs/design-summary.html §sensor: activation → wifi-connect
// (iOS/Android variants) → waiting → connected | error.

interface LocationState {
  device?: Device;
}

type Step =
  | 'activation'
  | 'wifi-connect'
  | 'waiting'
  | 'error'
  | 'connected'
  | 'calibrate-intro'
  | 'calibrate-dry'
  | 'calibrate-wet'
  | 'calibrate-done';

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// How long to wait on the "waiting" screen before showing the error frame.
// Firmware needs up to ~60s to join home Wi-Fi + NTP + send first batch;
// 120s gives some headroom.
const WAITING_TIMEOUT_MS = 120_000;

export function DeviceSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const stateDevice = (location.state as LocationState | null)?.device ?? null;

  const [device, setDevice] = useState<Device | null>(stateDevice);
  // `?wait=1` is set when the user comes back from the captive-portal "saved"
  // page after submitting Wi-Fi creds — activation/wifi-connect would be a
  // backstep at that point. Default flow (fresh add-device from Home) starts
  // at activation as usual.
  const [step, setStep] = useState<Step>(
    searchParams.get('wait') === '1' ? 'waiting' : 'activation',
  );
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (device || !id) return;
    api.listDevices()
      .then((r) => {
        const found = r.devices.find((d) => d.id === id) ?? null;
        if (!found) navigate('/', { replace: true });
        setDevice(found);
      })
      .catch(() => undefined);
  }, [device, id, navigate]);

  // Live `soilMoistureRaw` from the freshest measurement. We surface it on
  // the calibration screens so the user can sanity-check that the value
  // moves between air and water before they tap "Зафиксировать".
  const [latestSoilRaw, setLatestSoilRaw] = useState<number | null>(null);

  // Poll latest measurement once we're past activation. First measurement
  // arriving flips waiting → connected; from then on the same poll keeps
  // `latestSoilRaw` fresh for the calibration screens.
  useEffect(() => {
    if (!id || step === 'activation') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const latest = await api.latestMeasurement(id);
        if (cancelled) return;
        setLatestSoilRaw(latest.measurement?.soilMoistureRaw ?? null);
        if (latest.measurement && stepRef.current === 'waiting') {
          setStep('connected');
        }
      } catch {
        /* keep polling */
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id, step]);

  // Waiting → error timeout.
  useEffect(() => {
    if (step !== 'waiting') return;
    const t = setTimeout(() => {
      if (stepRef.current === 'waiting') setStep('error');
    }, WAITING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [step]);

  if (!device) {
    return (
      <main className="min-h-full flex items-center justify-center text-neutral-500">
        Загружаем…
      </main>
    );
  }

  // Captive-portal SSID is `Zelenka-XXXX` where XXXX is the last 2 bytes of
  // the chip's AP MAC — assigned by hardware and unrelated to our DB id, so
  // we can't show the exact suffix here. The wording in the UI tells the
  // user to pick any network starting with "Zelenka-".
  const ssidPrefix = 'Zelenka-';
  const portalUrl = `http://192.168.4.1/?token=${encodeURIComponent(device.deviceToken)}`;

  return (
    <main className="min-h-full p-5 max-w-md mx-auto text-neutral-900 dark:text-neutral-100">
      <header className="flex items-center gap-2.5 mb-5">
        <span className="w-9 h-9 rounded-full bg-status-ok flex items-center justify-center text-white">
          <PlantArt className="w-[22px] h-auto" strokeWidth={18} />
        </span>
        <span className="text-base font-medium">Zelenka</span>
      </header>

      {step === 'activation' && (
        <Activation onNext={() => setStep('wifi-connect')} />
      )}
      {step === 'wifi-connect' && (
        <WifiConnect
          ssidPrefix={ssidPrefix}
          portalUrl={portalUrl}
          onProceed={() => setStep('waiting')}
        />
      )}
      {step === 'waiting' && (
        <Waiting />
      )}
      {step === 'error' && (
        <ErrorFrame onRetry={() => setStep('wifi-connect')} />
      )}
      {step === 'connected' && (
        <Connected
          onCalibrate={() => setStep('calibrate-intro')}
          onSkip={() => navigate(`/devices/${device.id}/identify`, { replace: true })}
        />
      )}
      {step === 'calibrate-intro' && (
        <CalibrateIntro
          onStart={() => setStep('calibrate-dry')}
          onSkip={() => navigate(`/devices/${device.id}/identify`, { replace: true })}
        />
      )}
      {step === 'calibrate-dry' && (
        <CalibrateStep
          which="dry"
          soilRaw={latestSoilRaw}
          onCommit={async () => {
            if (latestSoilRaw == null) return;
            await api.setSoilCalibration(device.id, { dryRaw: latestSoilRaw });
            setStep('calibrate-wet');
          }}
        />
      )}
      {step === 'calibrate-wet' && (
        <CalibrateStep
          which="wet"
          soilRaw={latestSoilRaw}
          onCommit={async () => {
            if (latestSoilRaw == null) return;
            await api.setSoilCalibration(device.id, { wetRaw: latestSoilRaw });
            setStep('calibrate-done');
          }}
        />
      )}
      {step === 'calibrate-done' && (
        <CalibrateDone
          onNext={() => navigate(`/devices/${device.id}/identify`, { replace: true })}
        />
      )}
    </main>
  );
}

function Activation({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center pt-1">
        <div className="w-44 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center" style={{ height: 200 }}>
          <SensorIllustration />
        </div>
      </div>

      <div>
        <h1 className="text-[22px] font-medium leading-tight">Включите датчик</h1>
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Удерживайте сенсорную кнопку 5 секунд, пока индикатор не начнёт мигать.
        </p>
      </div>

      <InfoNote>Не загорается? Зарядите аккумулятор.</InfoNote>

      <button
        onClick={onNext}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Индикатор мигает — дальше
      </button>
    </div>
  );
}

function WifiConnect({
  ssidPrefix,
  portalUrl,
  onProceed,
}: {
  ssidPrefix: string;
  portalUrl: string;
  onProceed: () => void;
}) {
  const ios = isIOS();
  // Suffix is assigned by hardware (last 2 bytes of the AP MAC) and we have
  // no way to predict it server-side — so we render the prefix + an ellipsis
  // placeholder and tell the user any "Zelenka-…" network will work.
  const ssidLabel = `${ssidPrefix}…`;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-medium leading-tight">Подключитесь к датчику</h1>
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          {ios ? (
            <>Откройте настройки Wi-Fi на телефоне и выберите любую сеть, начинающуюся с <span className="text-neutral-900 dark:text-neutral-100 font-medium">{ssidLabel}</span> — это и есть датчик.</>
          ) : (
            <>В настройках Wi-Fi появится сеть <span className="text-neutral-900 dark:text-neutral-100 font-medium">{ssidLabel}</span> (буквы и цифры после дефиса зависят от датчика). Выберите её — откроется страница настройки.</>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
        <strong>Выключите VPN</strong> на время подключения — иначе форма
        на 192.168.4.1 не откроется.
      </div>

      {ios ? (
        <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800 p-4 flex flex-col gap-3">
          <WifiStep n={1} title="Выйдите из приложения" sub="свайп вверх или кнопка «Домой»" />
          <WifiStep n={2} title="Откройте Настройки → Wi-Fi" />
          <WifiStep n={3}>
            Выберите сеть <span className="font-medium">{ssidLabel}</span> — откроется страница настройки
          </WifiStep>
        </div>
      ) : (
        <FakeWifiList ssidLabel={ssidLabel} />
      )}

      <a
        href={portalUrl}
        target="_blank"
        rel="noreferrer noopener"
        onClick={() => setTimeout(onProceed, 300)}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium flex items-center justify-center gap-2"
      >
        <Icon name="arrow-right" size={17} />
        Я подключился — открыть форму
      </a>

      <div className="border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 flex items-start gap-2 text-[11px] text-neutral-400 leading-relaxed">
        <Icon name="info-circle" size={14} className="mt-0.5 shrink-0" />
        <span>Датчик работает только в&nbsp;сетях 2.4&nbsp;ГГц. Кнопка сработает только когда телефон уже в сети <span className="font-medium">{ssidLabel}</span>.</span>
      </div>

      <button
        onClick={onProceed}
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Не вижу сеть «{ssidLabel}»
      </button>
    </div>
  );
}

function Waiting() {
  return (
    <div className="space-y-5 pt-8">
      <div className="flex justify-center">
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
            <Icon name="broadcast" size={42} />
          </div>
          <svg className="absolute -inset-1.5" viewBox="0 0 96 96" aria-hidden>
            <circle
              cx="48" cy="48" r="46" fill="none"
              stroke="#639922" strokeWidth="2"
              strokeDasharray="60 290" strokeLinecap="round"
              transform="rotate(-90 48 48)"
              style={{ transformOrigin: '48px 48px', animation: 'spin 1.4s linear infinite' }}
            />
          </svg>
        </div>
      </div>

      <div className="text-center px-2">
        <div className="text-[20px] font-medium leading-tight">Ждём датчик</div>
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Подключается к домашнему Wi-Fi, до минуты.
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }`}</style>
    </div>
  );
}

function ErrorFrame({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center pt-3">
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center">
          <Icon name="alert-circle" size={32} />
        </div>
      </div>

      <div className="text-center px-2">
        <div className="text-[20px] font-medium leading-tight">Датчик не вышел на связь</div>
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
          Прошло больше минуты. Скорее всего одно из:
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 px-1">
        <Reason icon="wifi">Телефон не в домашней сети — проверьте Wi-Fi</Reason>
        <Reason icon="lock">Пароль домашней сети был неверный</Reason>
        <Reason icon="broadcast">Датчик выключился — нажмите кнопку</Reason>
      </ul>

      <button
        onClick={onRetry}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Попробовать снова
      </button>
      <a
        href="https://t.me/Sarrz0"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Написать в поддержку — @Sarrz0
      </a>
    </div>
  );
}

function Connected({
  onCalibrate,
  onSkip,
}: {
  onCalibrate: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center pt-6">
        <div className="w-24 h-24 rounded-full bg-status-ok text-white flex items-center justify-center">
          <Icon name="check" size={48} />
        </div>
      </div>

      <div className="text-center px-6">
        <div className="text-[22px] font-medium leading-tight">Датчик на связи</div>
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Прислал первый замер. Осталось показать ему, что такое «сухо» и «мокро» — без этого влажность почвы будет приблизительной.
        </div>
      </div>

      <button
        onClick={onCalibrate}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Откалибровать датчик
      </button>
      <button
        onClick={onSkip}
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Пропустить — показания будут приблизительными
      </button>
    </div>
  );
}

function CalibrateIntro({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center pt-1">
        <div className="w-44 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center" style={{ height: 180 }}>
          <CalibrationIllustration />
        </div>
      </div>
      <div>
        <h1 className="text-[22px] font-medium leading-tight">Откалибруем датчик</h1>
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Покажем датчику, что такое «сухо» и «мокро». Без этого влажность почвы будет приблизительной.
        </p>
      </div>

      <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800 px-3.5 py-3">
        <div className="text-[12px] text-neutral-500 dark:text-neutral-400 mb-2">Что понадобится</div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[13px]">
            <Icon name="droplet" size={16} className="text-neutral-500" />
            <span>Стакан с водой комнатной температуры</span>
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="w-4 inline-block text-neutral-500 text-center">⏱</span>
            <span>Около минуты</span>
          </div>
        </div>
      </div>

      <button
        onClick={onStart}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Начать
      </button>
      <button
        onClick={onSkip}
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Пропустить — показания будут приблизительными
      </button>
    </div>
  );
}

function CalibrateStep({
  which, soilRaw, onCommit,
}: {
  which: 'dry' | 'wet';
  soilRaw: number | null;
  onCommit: () => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);
  const isDry = which === 'dry';
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div />
        <div className="text-[11px] text-neutral-400">{isDry ? '1 из 2' : '2 из 2'}</div>
      </div>

      <div className="flex justify-center">
        <div className="w-40 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center" style={{ height: 140 }}>
          {isDry ? <DryIllustration /> : <WetIllustration />}
        </div>
      </div>

      <div>
        <h1 className="text-[20px] font-medium leading-tight">
          {isDry ? 'Подержите датчик в воздухе' : 'Опустите щуп в воду'}
        </h1>
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
          {isDry
            ? 'Около 10 секунд. Держите за корпус, не касайтесь щупа.'
            : 'Опустите длинную часть датчика — корпус оставьте сухим. Около 10 секунд.'}
        </p>
      </div>

      <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800 px-3.5 py-3 flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-status-ok" />
        <div className="flex-1">
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Текущее значение</div>
          <div className="text-[15px] font-medium tabular-nums">
            {soilRaw == null ? 'ждём первый замер…' : soilRaw}
          </div>
        </div>
      </div>

      <button
        onClick={async () => { setPending(true); try { await onCommit(); } finally { setPending(false); } }}
        disabled={soilRaw == null || pending}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium disabled:opacity-50"
      >
        {pending ? 'Сохраняем…' : isDry ? 'Зафиксировать «сухо»' : 'Зафиксировать «мокро»'}
      </button>
    </div>
  );
}

function CalibrateDone({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex justify-center pt-6">
        <div className="w-24 h-24 rounded-full bg-status-ok text-white flex items-center justify-center">
          <Icon name="check" size={48} />
        </div>
      </div>
      <div className="text-center px-6">
        <div className="text-[22px] font-medium leading-tight">Калибровка готова</div>
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Теперь датчик умеет переводить показания в проценты влажности. Можно знакомиться с растением.
        </div>
      </div>
      <button
        onClick={onNext}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Опознать растение
      </button>
    </div>
  );
}

function CalibrationIllustration() {
  return (
    <svg width="140" height="130" viewBox="0 0 140 130" aria-hidden>
      <rect x="46" y="8" width="6" height="46" fill="#888780" />
      <rect x="44" y="2" width="10" height="8" rx="2" fill="#B4B2A9" />
      <circle cx="49" cy="6" r="1.5" fill="#639922" />
      <path d="M 40 36 L 36 118 L 88 118 L 84 36 Z" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400" />
      <path d="M 38 62 L 86 62 L 88 118 L 36 118 Z" fill="#85B7EB" opacity="0.5" />
      <ellipse cx="62" cy="62" rx="24" ry="2.5" fill="#85B7EB" />
      <rect x="46" y="54" width="6" height="42" fill="#888780" />
      <polygon points="46,96 52,96 49,108" fill="#888780" />
    </svg>
  );
}

function DryIllustration() {
  return (
    <svg width="60" height="120" viewBox="0 0 60 120" aria-hidden>
      <rect x="22" y="6" width="16" height="22" rx="3" fill="#B4B2A9" />
      <circle cx="30" cy="14" r="2.5" fill="#639922" />
      <rect x="28" y="28" width="4" height="78" fill="#888780" />
      <polygon points="28,106 32,106 30,116" fill="#888780" />
    </svg>
  );
}

function WetIllustration() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
      <rect x="46" y="2" width="14" height="20" rx="3" fill="#B4B2A9" />
      <circle cx="53" cy="8" r="2" fill="#639922" />
      <path d="M 38 38 L 34 110 L 90 110 L 86 38 Z" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-400" />
      <path d="M 36 56 L 88 56 L 90 110 L 34 110 Z" fill="#85B7EB" opacity="0.5" />
      <ellipse cx="62" cy="56" rx="26" ry="2.5" fill="#85B7EB" />
      <rect x="51" y="22" width="4" height="74" fill="#888780" />
      <polygon points="51,96 55,96 53,106" fill="#888780" />
    </svg>
  );
}

function WifiStep({ n, title, sub, children }: {
  n: number;
  title?: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5 items-start">
      <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-[11px] font-medium leading-none">
        {n}
      </span>
      <div className="text-[13px] leading-relaxed">
        {title ?? children}
        {sub && <div className="text-[12px] text-neutral-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function FakeWifiList({ ssidLabel }: { ssidLabel: string }) {
  return (
    <div className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
      <div className="px-3 py-2 text-[11px] text-neutral-400 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
        Настройки → Wi-Fi
      </div>
      <WifiRow name="HomeNet_5G" muted lock />
      <div className="bg-neutral-50 dark:bg-neutral-900">
        <WifiRow name={ssidLabel} highlight />
      </div>
      <WifiRow name="Neighbour_2.4" muted lock />
    </div>
  );
}

function WifiRow({
  name, muted, lock, highlight,
}: { name: string; muted?: boolean; lock?: boolean; highlight?: boolean }) {
  const nameClass = muted ? 'text-neutral-400' : 'text-neutral-900 dark:text-neutral-100';
  const weight = highlight ? 'font-medium' : '';
  const iconColor = highlight ? 'text-status-ok' : 'text-neutral-400';
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 ${highlight ? 'border-y-2 border-status-ok' : 'border-b border-neutral-200 dark:border-neutral-800 last:border-b-0'}`}>
      <span className={iconColor}><Icon name="wifi" size={17} /></span>
      <span className={`flex-1 text-[14px] ${nameClass} ${weight}`}>{name}</span>
      {lock && <span className="text-neutral-300 dark:text-neutral-600"><Icon name="lock" size={13} /></span>}
      {highlight && <span className="text-status-ok"><Icon name="arrow-right" size={15} /></span>}
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-neutral-100 dark:bg-neutral-800 px-3 py-2.5 flex items-start gap-2 text-[12px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
      <Icon name="info-circle" size={16} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Reason({ icon, children }: { icon: 'wifi' | 'lock' | 'broadcast'; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] leading-relaxed">
      <span className="text-neutral-400 mt-0.5 shrink-0"><Icon name={icon} size={17} /></span>
      <span>{children}</span>
    </li>
  );
}

// Sensor silhouette — body + small light dome + bezel + ground stake,
// matching the SVG used in docs/design-summary.html §sensor frame 1.
function SensorIllustration() {
  return (
    <svg width="100" height="180" viewBox="0 0 100 180" aria-hidden>
      <rect x="32" y="8" width="36" height="60" rx="6" fill="#B4B2A9" />
      <circle cx="50" cy="24" r="5" fill="#639922" />
      <circle cx="50" cy="24" r="2" fill="#C0DD97" />
      <rect x="42" y="42" width="16" height="3" rx="1.5" fill="#5F5E5A" />
      <circle cx="50" cy="56" r="4" fill="#5F5E5A" />
      <circle cx="50" cy="56" r="2.5" fill="#888780" />
      <rect x="46" y="68" width="8" height="92" fill="#888780" />
      <polygon points="46,160 54,160 50,178" fill="#888780" />
      <g stroke="#639922" strokeWidth="1.2" fill="none" opacity="0.4">
        <path d="M 22 14 Q 8 8 0 12" />
        <path d="M 78 14 Q 92 8 100 12" />
        <path d="M 22 34 Q 6 36 0 40" />
        <path d="M 78 34 Q 94 36 100 40" />
      </g>
    </svg>
  );
}
