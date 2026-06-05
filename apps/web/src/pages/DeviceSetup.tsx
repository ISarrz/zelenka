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
  | 'connected';

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

  // While waiting, poll the latest measurement: the first one to arrive means
  // the sensor reached the server, so flip waiting → connected.
  useEffect(() => {
    if (!id || step !== 'waiting') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const latest = await api.latestMeasurement(id);
        if (cancelled) return;
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
        <span className="text-base font-medium">Zeleno</span>
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
          onContinue={() => navigate(`/devices/${device.id}/identify`, { replace: true })}
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
          Убедитесь, что датчик работает: на нём должен ровно гореть белый индикатор. Это значит, что датчик включён и ждёт настройку.
        </p>
      </div>

      <InfoNote>Индикатор не горит? Зарядите аккумулятор и включите датчик заново.</InfoNote>

      <button
        onClick={onNext}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Горит белым — дальше
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
          Подключается к домашнему Wi-Fi.
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
        <Reason icon="broadcast">Датчик выключился — зарядите аккумулятор</Reason>
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

function Connected({ onContinue }: { onContinue: () => void }) {
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
          Прислал первый замер. Можно знакомиться с растением.
        </div>
      </div>

      <button
        onClick={onContinue}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Продолжить
      </button>
    </div>
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
