import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  api,
  type CareEvent,
  type Measurement,
  type Severity,
  type Verdict,
} from '../api';

// Drill-down screens per docs/design-summary.html §metric. Single component
// dispatches on :metric (soil / light / temperature / humidity) — the layout
// is identical, only labels / units / accent / chart formatting differ.

type Metric = 'soil' | 'light' | 'temperature' | 'humidity';

interface MetricConfig {
  title: string;
  measurementKey: 'soilMoistureRaw' | 'lux' | 'temperatureC' | 'humidityPct';
  thresholdKey: 'soilMoistureRaw' | 'lux' | 'temperatureC' | 'humidityPct';
  // Display value + unit. For soil we keep raw — calibration to % is a
  // future step (per-chip ADC characterisation).
  formatValue: (n: number) => { value: string; unit: string };
  // Soil's range is inverted (lower raw = wetter); chart Y-axis is flipped
  // and the range bar reads right-to-left.
  inverted: boolean;
  // danger if straight-up dangerous (temperature drop), warning otherwise.
  alertTone: 'warning' | 'danger';
  // Labels along the 3-segment range bar (low / ok / high).
  bandLabels: [string, string, string];
  // Show watering markers on the chart? Only soil.
  showCareEvents: boolean;
}

const CONFIG: Record<Metric, MetricConfig> = {
  soil: {
    title: 'Почва',
    measurementKey: 'soilMoistureRaw',
    thresholdKey: 'soilMoistureRaw',
    formatValue: (n) => ({ value: String(Math.round(n)), unit: 'raw' }),
    inverted: true,
    alertTone: 'warning',
    bandLabels: ['сухо', 'норма', 'влажно'],
    showCareEvents: true,
  },
  light: {
    title: 'Свет',
    measurementKey: 'lux',
    thresholdKey: 'lux',
    formatValue: (n) => n >= 1000
      ? { value: (n / 1000).toFixed(1), unit: 'k лк' }
      : { value: Math.round(n).toString(), unit: 'лк' },
    inverted: false,
    alertTone: 'warning',
    bandLabels: ['темно', 'норма', 'солнце'],
    showCareEvents: false,
  },
  temperature: {
    title: 'Температура',
    measurementKey: 'temperatureC',
    thresholdKey: 'temperatureC',
    formatValue: (n) => ({ value: n.toFixed(1), unit: '°C' }),
    inverted: false,
    alertTone: 'danger',
    bandLabels: ['холодно', 'норма', 'жарко'],
    showCareEvents: false,
  },
  humidity: {
    title: 'Воздух',
    measurementKey: 'humidityPct',
    thresholdKey: 'humidityPct',
    formatValue: (n) => ({ value: Math.round(n).toString(), unit: '%' }),
    inverted: false,
    alertTone: 'warning',
    bandLabels: ['сухо', 'норма', 'сыро'],
    showCareEvents: false,
  },
};

const METRIC_PARAM: Record<string, Metric> = {
  soil: 'soil',
  light: 'light',
  temperature: 'temperature',
  humidity: 'humidity',
};

type Range = 7 | 30;

export function MetricDetailPage() {
  const navigate = useNavigate();
  const { id, metric } = useParams<{ id: string; metric: string }>();
  const m = (metric && METRIC_PARAM[metric]) || null;
  const cfg = m ? CONFIG[m] : null;

  const [latest, setLatest] = useState<{
    plantName: string | null;
    measurement: Measurement | null;
    verdict: Verdict | null;
    thresholds: Record<string, unknown> | null;
    plantId: string | null;
  } | null>(null);
  const [samples, setSamples] = useState<Measurement[]>([]);
  const [events, setEvents] = useState<CareEvent[]>([]);
  const [range, setRange] = useState<Range>(7);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !cfg) return;
    let cancelled = false;
    const load = async () => {
      try {
        const l = await api.latestMeasurement(id);
        if (cancelled) return;
        setLatest({
          plantName: l.plant?.name ?? null,
          measurement: l.measurement,
          verdict: l.verdict,
          thresholds: (l as unknown as { thresholds: Record<string, unknown> }).thresholds,
          plantId: l.plant?.id ?? null,
        });
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
  }, [id, cfg, navigate]);

  useEffect(() => {
    if (!id || !cfg) return;
    let cancelled = false;
    api.measurements(id, range)
      .then((r) => { if (!cancelled) setSamples(r.samples); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, cfg, range]);

  useEffect(() => {
    if (!latest?.plantId || !cfg?.showCareEvents) return;
    let cancelled = false;
    api.events(latest.plantId)
      .then((r) => { if (!cancelled) setEvents(r.events); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [latest?.plantId, cfg?.showCareEvents]);

  if (!cfg) {
    return (
      <main className="min-h-full flex items-center justify-center p-6 text-neutral-500">
        Неизвестный показатель
      </main>
    );
  }
  if (error) {
    return (
      <main className="min-h-full flex items-center justify-center p-6 text-neutral-500">
        {error}
      </main>
    );
  }
  if (!latest) {
    return (
      <main className="min-h-full flex items-center justify-center p-6 text-neutral-500">
        Загружаем…
      </main>
    );
  }

  const rawValue = latest.measurement?.[cfg.measurementKey] ?? null;
  const severity: Severity | undefined =
    latest.verdict?.perParam[cfg.measurementKey === 'soilMoistureRaw' ? 'soilMoistureRaw' : cfg.measurementKey] ?? undefined;
  const band = (latest.thresholds?.[cfg.thresholdKey] as Record<string, number> | undefined) ?? null;
  const status = rawValue == null ? null : statusText(m!, rawValue, severity, band, cfg.inverted);
  const action = rawValue == null ? null : actionText(m!, severity);
  const contextLine = computeContext(m!, latest.measurement, events, samples);

  return (
    <main className="min-h-full bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <button
          onClick={() => navigate(-1)}
          aria-label="Назад"
          className="p-1 text-xl"
        >←</button>
        <div className="flex-1">
          <div className="text-base font-medium leading-tight">{cfg.title}</div>
          <div className="text-xs text-neutral-500">{latest.plantName ?? 'без растения'}</div>
        </div>
      </div>

      {/* Hero value + range bar */}
      <div className="px-5 pt-5 pb-1 text-center">
        {rawValue == null ? (
          <div className="text-4xl font-medium leading-none text-neutral-400">—</div>
        ) : (
          <>
            <div className="text-4xl font-medium leading-none tabular-nums">
              {cfg.formatValue(rawValue).value}
              <span className="text-2xl text-neutral-400 ml-1.5">{cfg.formatValue(rawValue).unit}</span>
            </div>
            {status && (
              <div className="text-sm font-medium mt-1.5">{status}</div>
            )}
            <RangeBar
              labels={cfg.bandLabels}
              value={rawValue}
              band={band}
              inverted={cfg.inverted}
            />
          </>
        )}
      </div>

      {/* Action recommendation */}
      {action && (
        <div
          className={`mx-4 mt-3 p-3.5 rounded-xl border ${
            action.tone === 'danger'
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
              : action.tone === 'warning'
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                : 'bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-200'
          }`}
        >
          <div className="text-sm font-medium">{action.headline}</div>
          {action.body && (
            <div className="text-xs mt-1.5 leading-relaxed opacity-90">{action.body}</div>
          )}
        </div>
      )}

      {contextLine && (
        <div className="text-center text-xs text-neutral-400 mt-3">{contextLine}</div>
      )}

      {/* Chart */}
      <div className="mx-4 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">{cfg.title}</div>
          <RangeToggle range={range} onChange={setRange} />
        </div>
        <MetricChart
          samples={samples}
          dataKey={cfg.measurementKey}
          band={band}
          inverted={cfg.inverted}
          events={cfg.showCareEvents ? events : []}
        />
      </div>

      <div className="h-12" />
    </main>
  );
}

function RangeToggle({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex rounded-md border border-neutral-300 dark:border-neutral-700 overflow-hidden text-xs">
      {[7, 30].map((r) => (
        <button
          key={r}
          onClick={() => onChange(r as Range)}
          className={`px-3 py-1 ${
            range === r ? 'bg-neutral-100 dark:bg-neutral-800 font-medium' : 'text-neutral-500'
          }`}
        >
          {r} дней
        </button>
      ))}
    </div>
  );
}

function RangeBar({
  labels,
  value,
  band,
  inverted,
}: {
  labels: [string, string, string];
  value: number;
  band: Record<string, number> | null;
  inverted: boolean;
}) {
  // Compute marker position 0..1 along the bar.
  let pos = 0.5;
  if (band) {
    if (inverted) {
      // soil: criticallyDry → 0 (leftmost), wet → 1 (rightmost). Map a "soaked"
      // floor at 500 so the cursor doesn't pin to the edge for plausibly wet
      // readings.
      const dry = band.criticallyDry ?? 3300;
      const soakedFloor = 500;
      const v = Math.max(soakedFloor, Math.min(dry, value));
      pos = 1 - (v - soakedFloor) / (dry - soakedFloor);
    } else {
      const lo = band.warnMin ?? 0;
      const hi = band.warnMax ?? 100;
      pos = (value - lo) / (hi - lo);
    }
  }
  pos = Math.max(0.03, Math.min(0.97, pos));

  // Mid (ok) segment width — for visual reference. Default 40% if we don't
  // have band data.
  const midPct = 40;
  const sidePct = (100 - midPct) / 2;

  return (
    <div className="relative mx-1 mt-4">
      <div className="flex h-2 rounded-full overflow-hidden">
        <div style={{ flex: sidePct }} className="bg-red-200 dark:bg-red-900/40" />
        <div style={{ flex: midPct }} className="bg-green-200 dark:bg-green-900/40" />
        <div style={{ flex: sidePct }} className="bg-red-200 dark:bg-red-900/40" />
      </div>
      <div
        className="absolute -top-1 w-0.5 h-4 bg-neutral-900 dark:bg-neutral-100"
        style={{ left: `${pos * 100}%`, transform: 'translateX(-50%)' }}
      />
      <div className="flex justify-between mt-2 text-[10px] text-neutral-400">
        <span>{labels[0]}</span>
        <span>{labels[1]}</span>
        <span>{labels[2]}</span>
      </div>
    </div>
  );
}

function MetricChart({
  samples,
  dataKey,
  band,
  inverted,
  events,
}: {
  samples: Measurement[];
  dataKey: MetricConfig['measurementKey'];
  band: Record<string, number> | null;
  inverted: boolean;
  events: CareEvent[];
}) {
  const data = useMemo(
    () => samples.map((s) => ({ t: new Date(s.measuredAt).getTime(), [dataKey]: s[dataKey] })),
    [samples, dataKey],
  );

  // Ok-band reference area.
  let okFrom: number | null = null;
  let okTo: number | null = null;
  if (band) {
    if (inverted) {
      okFrom = band.wet ?? null;
      okTo = band.dry ?? null;
    } else {
      okFrom = band.okMin ?? null;
      okTo = band.okMax ?? null;
    }
  }

  // Snap care events to nearest sample's x coordinate.
  const eventDots = events
    .map((e) => {
      const t = new Date(e.occurredAt).getTime();
      const nearest = data.reduce<{ t: number; v: number | null | undefined } | null>(
        (best, p) => {
          const d = Math.abs(p.t - t);
          if (!best || d < Math.abs(best.t - t)) return { t: p.t, v: p[dataKey] as number | null };
          return best;
        },
        null,
      );
      return nearest && nearest.v != null ? { id: e.id, t: nearest.t, v: nearest.v } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className="h-44">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(150 150 150 / 0.12)" />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
            }}
            fontSize={10}
            minTickGap={28}
          />
          <YAxis
            fontSize={10}
            width={32}
            domain={['auto', 'auto']}
            reversed={inverted}
          />
          {okFrom != null && okTo != null && (
            <ReferenceArea y1={okFrom} y2={okTo} fill="rgb(34 197 94)" fillOpacity={0.1} />
          )}
          <Tooltip
            labelFormatter={(v) => new Date(Number(v)).toLocaleString('ru-RU')}
            formatter={(v) => {
              const n = typeof v === 'number' ? v : null;
              if (n == null) return '—';
              return Number.isInteger(n) ? `${n}` : n.toFixed(1);
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="rgb(34 197 94)"
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {eventDots.map((e) => (
            <ReferenceDot
              key={e.id}
              x={e.t}
              y={e.v}
              r={4}
              fill="#0ea5e9"
              stroke="#fff"
              strokeWidth={1.5}
              ifOverflow="visible"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function statusText(
  m: Metric,
  value: number,
  sev: Severity | undefined,
  band: Record<string, number> | null,
  inverted: boolean,
): string {
  if (!sev || sev === 'unknown') return 'Калибровка';
  if (sev === 'ok') return 'В норме';
  let isHigh = false;
  if (band) {
    if (inverted) isHigh = value < (band.wet ?? -Infinity);
    else isHigh = value > (band.okMax ?? Infinity);
  }
  switch (m) {
    case 'soil':
      if (sev === 'alert') return isHigh ? 'Почва переувлажнена' : 'Почва сухая';
      return isHigh ? 'Почва влажная' : 'Почва подсыхает';
    case 'light':
      if (sev === 'alert') return isHigh ? 'Слишком ярко' : 'Очень мало света';
      return isHigh ? 'Близко к солнцу' : 'Темновато';
    case 'temperature':
      if (sev === 'alert') return isHigh ? 'Жарко' : 'Холодно';
      return isHigh ? 'Тепловато' : 'Прохладно';
    case 'humidity':
      if (sev === 'alert') return isHigh ? 'Очень влажно' : 'Очень сухо';
      return isHigh ? 'Воздух влажный' : 'Воздух сухой';
  }
}

function actionText(m: Metric, sev: Severity | undefined): {
  headline: string; body: string | null; tone: 'warning' | 'danger' | 'info';
} | null {
  if (!sev || sev === 'ok' || sev === 'unknown') return null;
  switch (m) {
    case 'soil':
      return sev === 'alert'
        ? { headline: 'Полейте 200–250 мл воды как можно скорее.', body: 'Земля пересохла — корни не получают влагу. Холодную или ледяную воду не используйте.', tone: 'warning' }
        : { headline: 'Полейте 150–200 мл тёплой воды.', body: 'Земля подсыхает. Лучше полить заранее, чем дожидаться пересыхания.', tone: 'warning' };
    case 'light':
      return sev === 'alert'
        ? { headline: 'Переставьте ближе к окну.', body: 'Света критически мало. Восточное или южное окно подойдёт.', tone: 'warning' }
        : { headline: 'Переставьте чуть ближе к окну.', body: 'Дневной свет ниже нормы — на длительной дистанции это замедляет рост.', tone: 'warning' };
    case 'temperature':
      return sev === 'alert'
        ? { headline: 'Уберите от холодного окна или батареи.', body: 'Температура за границей безопасной — корни могут пострадать за ночь.', tone: 'danger' }
        : { headline: 'Контролируйте температуру.', body: 'Близко к границе нормы. Сквозняк или близость к окну могут утянуть в опасную зону.', tone: 'warning' };
    case 'humidity':
      return sev === 'alert'
        ? { headline: 'Опрыскивайте 2–3 раза в день.', body: 'Воздух критически сухой. Поставьте увлажнитель или поддон с водой рядом.', tone: 'warning' }
        : { headline: 'Опрыскивайте 2–3 раза в неделю.', body: 'Отопление сушит воздух — это типично для зимы.', tone: 'warning' };
  }
}

function computeContext(
  m: Metric,
  measurement: Measurement | null,
  events: CareEvent[],
  samples: Measurement[],
): string | null {
  if (!measurement) return null;
  if (m === 'soil') {
    const lastWater = events.filter((e) => e.kind === 'water')[0];
    if (lastWater) {
      const days = Math.floor((Date.now() - new Date(lastWater.occurredAt).getTime()) / 86400000);
      if (days === 0) return 'Последний полив — сегодня';
      if (days === 1) return 'Последний полив — вчера';
      return `Последний полив — ${days} ${pluralDays(days)} назад`;
    }
    return null;
  }
  if (m === 'light') {
    const vals = samples.map((s) => s.lux).filter((v): v is number => v != null);
    if (vals.length === 0) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `Среднее за период — ${avg >= 1000 ? (avg / 1000).toFixed(1) + ' k лк' : Math.round(avg) + ' лк'}`;
  }
  if (m === 'temperature') {
    // For temp, no clean computed signal; show "обновлено N минут назад".
    const age = Math.round((Date.now() - new Date(measurement.measuredAt).getTime()) / 60000);
    return `Обновлено ${age} мин. назад`;
  }
  if (m === 'humidity') {
    const age = Math.round((Date.now() - new Date(measurement.measuredAt).getTime()) / 60000);
    return `Обновлено ${age} мин. назад`;
  }
  return null;
}

function pluralDays(n: number): string {
  const r = n % 10;
  const r100 = n % 100;
  if (r100 >= 11 && r100 <= 14) return 'дней';
  if (r === 1) return 'день';
  if (r >= 2 && r <= 4) return 'дня';
  return 'дней';
}
