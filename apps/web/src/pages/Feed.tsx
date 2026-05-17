import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type FeedItem } from '../api';
import { BottomNav } from '../components/BottomNav';

// Global events feed per docs/design-summary.html §feed. Day-grouped list of
// care events + non-suppressed pushes. Each row navigates to the relevant
// metric drill-down (or the device-manage screen for connectivity/battery
// pushes).

type Tone = 'water' | 'warn' | 'alert' | 'info' | 'recovery';

interface KindConfig {
  title: string;
  tone: Tone;
  // What screen to open when the row is tapped. 'home' means stay on /,
  // 'manage' means /devices/:deviceId/manage. 'metric' picks a metric.
  target: 'home' | 'manage' | { metric: 'soil' | 'light' | 'temperature' | 'humidity' };
  symbol: string;
}

const KIND: Record<string, KindConfig> = {
  // CareEvent kinds
  water:     { title: 'Полив',         tone: 'water', target: { metric: 'soil' },        symbol: '💧' },
  fertilize: { title: 'Подкормка',     tone: 'info',  target: { metric: 'soil' },        symbol: '🌿' },
  repot:     { title: 'Пересадка',     tone: 'info',  target: 'home',                    symbol: '🪴' },
  moved:     { title: 'Перенесли',     tone: 'info',  target: 'home',                    symbol: '↔' },
  other:     { title: 'Событие',       tone: 'info',  target: 'home',                    symbol: '•' },
  // Immediate triggers
  soil_orange: { title: 'Пора полить',          tone: 'warn',  target: { metric: 'soil' },        symbol: '🔔' },
  soil_red:    { title: 'Срочно полить',        tone: 'alert', target: { metric: 'soil' },        symbol: '⚠' },
  temp_orange: { title: 'Близко к границе',     tone: 'warn',  target: { metric: 'temperature' }, symbol: '🌡' },
  temp_red:    { title: 'Опасная температура',  tone: 'alert', target: { metric: 'temperature' }, symbol: '⚠' },
  temp_drop:   { title: 'Температура падает',   tone: 'warn',  target: { metric: 'temperature' }, symbol: '↓' },
  // Scheduled triggers
  light_low:           { title: 'Мало света',         tone: 'warn',     target: { metric: 'light' },    symbol: '☀' },
  air_dry:             { title: 'Воздух сухой',       tone: 'warn',     target: { metric: 'humidity' }, symbol: '💨' },
  sensor_silent:       { title: 'Датчик молчит',      tone: 'alert',    target: 'manage',               symbol: '📡' },
  battery_low_week:    { title: 'Зарядите датчик',    tone: 'warn',     target: 'manage',               symbol: '🔋' },
  onboarding_place_ok:    { title: 'Место подходит',  tone: 'recovery', target: 'home',                 symbol: '✓' },
  onboarding_place_alert: { title: 'Место не очень',  tone: 'warn',     target: 'home',                 symbol: '!' },
  morning_digest:      { title: 'Утренняя сводка',    tone: 'info',     target: 'home',                 symbol: '☼' },
};

const TONE_BG: Record<Tone, string> = {
  water:    'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  warn:     'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  alert:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  info:     'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  recovery: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayBucket(iso: string, now: Date): string {
  const d = new Date(iso);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - DAY_MS);
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  if (start.getTime() === today.getTime()) return 'Сегодня';
  if (start.getTime() === yesterday.getTime()) return 'Вчера';
  const sameYear = d.getFullYear() === now.getFullYear();
  const month = d.toLocaleDateString('ru-RU', { month: 'long' });
  return sameYear
    ? `${d.getDate()} ${month}`
    : `${d.getDate()} ${month} ${d.getFullYear()}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function FeedPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await api.feed();
        if (!cancelled) setItems(r.items);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) navigate('/auth', { replace: true });
        else setError('Не удалось загрузить');
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [navigate]);

  const grouped = useMemo(() => {
    if (!items) return [];
    const now = new Date();
    const map = new Map<string, FeedItem[]>();
    const order: string[] = [];
    for (const it of items) {
      const k = dayBucket(it.occurredAt, now);
      if (!map.has(k)) { map.set(k, []); order.push(k); }
      map.get(k)!.push(it);
    }
    return order.map((k) => ({ day: k, items: map.get(k)! }));
  }, [items]);

  const handleRowClick = (it: FeedItem) => {
    const cfg = KIND[it.kind];
    if (!cfg) return;
    if (cfg.target === 'home') navigate('/');
    else if (cfg.target === 'manage') {
      if (it.deviceId) navigate(`/devices/${it.deviceId}/manage`);
    } else {
      if (it.deviceId) navigate(`/devices/${it.deviceId}/p/${cfg.target.metric}`);
    }
  };

  return (
    <main className="min-h-full bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 pb-16">
      <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-200 dark:border-neutral-800">
        <span className="text-lg font-medium">Лента</span>
        {/* Filter icon — design has it for multi-plant filtering; no-op for now. */}
        <span className="text-neutral-300 dark:text-neutral-700 text-xl" aria-hidden>⌕</span>
      </div>

      {error && (
        <div className="px-5 py-6 text-sm text-neutral-500">{error}</div>
      )}

      {!error && items == null && (
        <div className="px-5 py-6 text-sm text-neutral-500">Загружаем…</div>
      )}

      {items != null && items.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-neutral-500">
          Пока пусто. Здесь будут появляться поливы и уведомления.
        </div>
      )}

      {grouped.map((g) => (
        <section key={g.day}>
          <div className="px-4 pt-4 pb-2 text-[11px] font-medium tracking-wider uppercase text-neutral-400 dark:text-neutral-500 border-t border-neutral-100 dark:border-neutral-900 first:border-t-0">
            {g.day}
          </div>
          {g.items.map((it) => {
            const cfg = KIND[it.kind] ?? KIND.other;
            const isAuto = it.source === 'care' && it.careSource === 'auto';
            const displayTitle = isAuto && it.kind === 'water' ? 'Полив определён' : cfg.title;
            const sub = it.body
              ? `${it.plantName} · ${it.body}`
              : it.plantName;
            return (
              <button
                key={it.id}
                onClick={() => handleRowClick(it)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[15px] ${TONE_BG[cfg.tone]}`}>
                  {cfg.symbol}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{displayTitle}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{sub}</div>
                </div>
                <span className="text-xs text-neutral-400 flex-shrink-0">{formatTime(it.occurredAt)}</span>
              </button>
            );
          })}
        </section>
      ))}

      <BottomNav active="feed" />
    </main>
  );
}
