import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SettingsUser } from '../api';
import { unsubscribeFromPush } from '../lib/push';

export function SettingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<SettingsUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.meSettings()
      .then((r) => setUser(r.user))
      .catch((err) => {
        if ((err as { status?: number }).status === 401) navigate('/auth', { replace: true });
        else setError((err as Error).message);
      });
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.getRegistration()
        .then((reg) => reg?.pushManager.getSubscription())
        .then((sub) => setPushOn(!!sub))
        .catch(() => setPushOn(false));
    } else {
      setPushOn(false);
    }
  }, [navigate]);

  if (!user) {
    return <main className="min-h-full flex items-center justify-center text-neutral-500">Загрузка…</main>;
  }

  const setQuiet = async (field: 'quietHoursStartMin' | 'quietHoursEndMin', minutes: number | null) => {
    setSaving(true);
    try {
      const { user: updated } = await api.updateSettings({ [field]: minutes });
      setUser(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally { setSaving(false); }
  };

  const disablePush = async () => {
    const endpoint = await unsubscribeFromPush();
    if (endpoint) await api.pushUnsubscribe(endpoint).catch(() => undefined);
    setPushOn(false);
  };

  const logout = async () => {
    await api.logout().catch(() => undefined);
    navigate('/auth', { replace: true });
  };

  return (
    <main className="min-h-full p-5 max-w-md mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-status-ok text-sm underline">← Назад</button>
        <h1 className="text-lg font-semibold">Настройки</h1>
        <span className="w-12" />
      </header>

      <section className="space-y-1">
        <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Аккаунт</h2>
        <Row label="Почта" value={user.email} />
        <Row label="Часовой пояс" value={user.timezone} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Тихие часы</h2>
        <p className="text-xs text-neutral-500">
          В заданное окно уведомления не приходят — события за ночь
          присылаем одним пушем утром.
        </p>
        <div className="flex items-center gap-2">
          <TimeField
            label="С"
            value={user.quietHoursStartMin}
            onChange={(m) => setQuiet('quietHoursStartMin', m)}
            disabled={saving}
          />
          <TimeField
            label="До"
            value={user.quietHoursEndMin}
            onChange={(m) => setQuiet('quietHoursEndMin', m)}
            disabled={saving}
          />
        </div>
        {(user.quietHoursStartMin != null || user.quietHoursEndMin != null) && (
          <button
            onClick={async () => {
              await api.updateSettings({ quietHoursStartMin: null, quietHoursEndMin: null });
              const { user: u } = await api.meSettings();
              setUser(u);
            }}
            className="text-sm text-status-ok underline"
          >Сбросить тихие часы</button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Уведомления</h2>
        {pushOn === null ? (
          <p className="text-sm text-neutral-500">Проверяем…</p>
        ) : pushOn ? (
          <button
            onClick={disablePush}
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 py-2 text-sm"
          >Отписаться от push-уведомлений</button>
        ) : (
          <p className="text-sm text-neutral-500">Push сейчас выключен. Включить можно с главного экрана.</p>
        )}
      </section>

      <section>
        <button
          onClick={logout}
          className="w-full rounded-lg border border-status-alert/40 text-status-alert py-2 text-sm font-medium"
        >Выйти из аккаунта</button>
      </section>

      {error && <p className="text-sm text-status-alert">{error}</p>}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-neutral-200 dark:border-neutral-800 last:border-0">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function TimeField({
  label, value, onChange, disabled,
}: {
  label: string;
  value: number | null;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
}) {
  const hh = value == null ? '' : String(Math.floor(value / 60)).padStart(2, '0');
  const mm = value == null ? '' : String(value % 60).padStart(2, '0');
  return (
    <label className="flex-1">
      <span className="block text-xs text-neutral-500 mb-1">{label}</span>
      <input
        type="time"
        value={value == null ? '' : `${hh}:${mm}`}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) { onChange(null); return; }
          const [h, m] = v.split(':').map(Number);
          onChange(h * 60 + m);
        }}
        disabled={disabled}
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-base"
      />
    </label>
  );
}
