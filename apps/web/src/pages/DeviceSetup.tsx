import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, type Device } from '../api';

// Onboarding for a freshly created (or replacement) device — shows the new
// deviceToken + captive-portal walkthrough, then polls the latest
// measurement until the firmware checks in. Match docs/design-summary.html
// §sensor (provisioning) flow steps.

interface LocationState {
  device?: Device;
}

function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 4).toUpperCase();
}

export function DeviceSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const stateDevice = (location.state as LocationState | null)?.device ?? null;

  const [device, setDevice] = useState<Device | null>(stateDevice);
  const [ready, setReady] = useState(false);

  // If we landed on this URL without state (e.g. user refreshed), fetch the
  // device row by id to recover the deviceToken.
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

  // Poll the new device's /latest until a measurement lands.
  useEffect(() => {
    if (!id || ready) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const latest = await api.latestMeasurement(id);
        if (cancelled) return;
        if (latest.measurement) {
          setReady(true);
        }
      } catch {
        /* keep polling */
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, [id, ready]);

  if (!device) {
    return (
      <main className="min-h-full flex items-center justify-center text-neutral-500">
        Загружаем…
      </main>
    );
  }

  const ssid = `Zelenka-${shortId(device.id)}`;

  return (
    <main className="min-h-full p-5 max-w-md mx-auto text-neutral-900 dark:text-neutral-100">
      <div className="flex items-center gap-2 -mx-1 mb-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="p-1 text-xl"
        >←</button>
        <div className="flex-1 text-base font-medium">Подключение датчика</div>
      </div>

      {ready ? (
        <div className="space-y-4">
          <div className="text-center text-2xl font-medium">Датчик на связи</div>
          <p className="text-sm text-neutral-500 text-center leading-relaxed">
            {shortId(device.id)} прислал первый замер. Можно вернуться домой — на главном экране уже видны новые показания.
          </p>
          <button
            onClick={() => navigate(`/devices/${device.id}/manage`, { replace: true })}
            className="w-full py-3 rounded-lg bg-status-ok text-white font-medium"
          >
            Готово
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-neutral-500 leading-relaxed">
            Включите датчик и поднесите телефон ближе. Через 30 секунд он откроет свою Wi-Fi сеть.
          </p>

          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <strong>Выключите VPN</strong> на телефоне на время подключения. VPN перехватывает локальный трафик и форма на 192.168.4.1 не откроется.
          </div>

          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-[11px]">1</span>
              <span>В настройках Wi-Fi выберите сеть <span className="font-medium">{ssid}</span></span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-[11px]">2</span>
              <span>На открывшейся странице введите домашний Wi-Fi и вставьте токен ниже</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-[11px]">3</span>
              <span>Дождитесь, пока датчик подключится — этот экран обновится сам</span>
            </li>
          </ol>
          <div className="rounded-xl bg-neutral-100 dark:bg-neutral-900 p-3">
            <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1">Токен</div>
            <code className="select-all break-all text-xs">{device.deviceToken}</code>
          </div>

          <a
            href={`http://192.168.4.1/?token=${encodeURIComponent(device.deviceToken)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="block w-full py-3 rounded-lg bg-status-ok text-white text-sm font-medium text-center"
          >
            Открыть форму подключения
          </a>
          <p className="text-[11px] text-neutral-400 text-center leading-relaxed -mt-2">
            Кнопка работает только когда телефон уже подключён к Wi-Fi «{ssid}».
            Если форма не открылась автоматически — это альтернативный путь.
          </p>

          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
            Ожидаем первый замер от датчика
          </div>
        </div>
      )}
    </main>
  );
}
