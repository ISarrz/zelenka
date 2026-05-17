import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

// Firmware update screen per docs/design-summary.html §firmware.
//
// Design has three states (Ready → In Progress → Done). Our OTA is
// autonomous — the device picks up the new manifest after every
// successful batch POST and applies the update silently — so we only
// show two states from the user's POV:
//   • Available: current → new + release notes + "обновится сам в
//     течение часа"
//   • Up to date: "Прошивка актуальна"
// A push-from-app trigger would let us show the in-progress phase, but
// it'd need a new device-side endpoint and a wakeup mechanism the
// firmware doesn't have.

interface Info {
  current: string | null;
  manifest: { version: string; notes: string | null } | null;
}

export function FirmwareUpdatePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [latest, manifest] = await Promise.all([
          api.latestMeasurement(id),
          api.firmwareManifest().catch(() => null),
        ]);
        if (cancelled) return;
        setInfo({ current: latest.device.firmwareVersion, manifest });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) navigate('/auth', { replace: true });
        else if (status === 404) setError('Датчик не найден');
        else setError('Не удалось загрузить');
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate]);

  if (error) {
    return <main className="min-h-full flex items-center justify-center p-6 text-neutral-500">{error}</main>;
  }
  if (!info) {
    return <main className="min-h-full flex items-center justify-center p-6 text-neutral-500">Загружаем…</main>;
  }

  const updateAvailable =
    info.current != null && info.manifest != null && info.current !== info.manifest.version;

  return (
    <main className="min-h-full p-5 max-w-md mx-auto text-neutral-900 dark:text-neutral-100">
      <div className="flex items-center gap-2 -mx-1 mb-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="p-1 text-xl"
        >←</button>
        <div className="flex-1 text-base font-medium">Прошивка</div>
      </div>

      {updateAvailable ? (
        <div className="space-y-5">
          <div className="flex flex-col items-center pt-6">
            <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-3xl mb-3">
              ⌨
            </div>
            <div className="text-xl font-medium">Доступно обновление</div>
            <div className="text-sm text-neutral-500 mt-2 inline-flex items-center gap-2">
              <span>{info.current}</span>
              <span aria-hidden>→</span>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{info.manifest!.version}</span>
            </div>
          </div>

          {info.manifest!.notes && (
            <div className="rounded-xl bg-neutral-100 dark:bg-neutral-900 p-4">
              <div className="text-[11px] font-medium tracking-wider uppercase text-neutral-400 mb-2">
                Что нового
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed whitespace-pre-wrap">
                {info.manifest!.notes.trim()}
              </p>
            </div>
          )}

          <div className="border-l-2 border-neutral-300 dark:border-neutral-700 pl-3 py-2 flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            <span aria-hidden className="text-base leading-none mt-0.5">ⓘ</span>
            <p>
              Датчик обновится сам на следующем цикле — в течение часа. Принудительно подтолкнуть пока нельзя; обновление произойдёт после ближайшей передачи замеров.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5 pt-6">
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-status-ok/15 text-status-ok flex items-center justify-center text-3xl mb-3">
              ✓
            </div>
            <div className="text-xl font-medium">Прошивка актуальна</div>
            <div className="text-sm text-neutral-500 mt-2">{info.current ?? '—'}</div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 rounded-lg bg-status-ok text-white text-sm font-medium"
        >
          Готово
        </button>
      </div>
    </main>
  );
}
