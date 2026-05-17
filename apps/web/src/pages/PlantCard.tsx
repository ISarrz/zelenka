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
import { api, type CareEvent, type Measurement, type Plant } from '../api';
import { SpeciesCare } from '../components/SpeciesCare';

type Range = 7 | 30;

interface DeviceWithPlant {
  id: string;
  name: string;
  plant: Plant | null;
}

export function PlantCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState<DeviceWithPlant | null>(null);
  const [range, setRange] = useState<Range>(7);
  const [samples, setSamples] = useState<Measurement[]>([]);
  const [events, setEvents] = useState<CareEvent[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  // We address pages by device id; the plant is the one bound to it.
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const latest = await api.latestMeasurement(id);
        setDevice({ id: latest.device.id, name: latest.device.name, plant: latest.plant });
      } catch (err) {
        if ((err as { status?: number }).status === 401) navigate('/auth', { replace: true });
      }
    };
    load();
  }, [id, navigate]);

  useEffect(() => {
    if (!id) return;
    api.measurements(id, range).then((r) => setSamples(r.samples)).catch(() => undefined);
  }, [id, range]);

  useEffect(() => {
    if (!device?.plant) return;
    api.events(device.plant.id).then((r) => setEvents(r.events)).catch(() => undefined);
  }, [device?.plant]);

  const thresholds = useMemo(() => {
    // PlantSpecies.thresholds is JSON — we keep it loose here since the card
    // tolerates any subset (older species lack soil bands etc).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (device?.plant?.species as any)?.thresholds ?? null;
  }, [device?.plant]);

  if (!device) {
    return <main className="min-h-full flex items-center justify-center text-neutral-500">Загрузка…</main>;
  }

  const title = device.plant?.name ?? device.name;
  const subtitle = device.plant?.species?.commonNameRu
    ?? device.plant?.species?.commonNameEn
    ?? device.plant?.species?.scientificName
    ?? (device.plant ? 'общий профиль' : null);

  const data = samples.map((s) => ({
    t: new Date(s.measuredAt).getTime(),
    temperatureC: s.temperatureC,
    humidityPct: s.humidityPct,
    lux: s.lux,
    soilMoistureRaw: s.soilMoistureRaw,
  }));

  return (
    <main className="min-h-full p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <header className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-status-ok text-sm underline"
        >← Назад</button>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <h1 className="text-lg font-semibold leading-tight">{title}</h1>
            {subtitle && <p className="text-xs text-neutral-500 italic">{subtitle}</p>}
          </div>
          {device.plant?.species?.defaultImageUrl && (
            <img
              src={device.plant.species.defaultImageUrl}
              alt=""
              className="w-12 h-12 rounded-full object-cover border border-neutral-200 dark:border-neutral-800"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
      </header>

      {device.plant?.species && (
        <section className="space-y-4">
          <SpeciesCare thresholds={thresholds} />
          {device.plant.species.description && (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
              <div className="text-[11px] font-medium tracking-wider uppercase text-neutral-400 dark:text-neutral-500 mb-2">
                О растении
              </div>
              <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                {device.plant.species.description}
              </p>
              {device.plant.species.family && (
                <p className="text-xs text-neutral-400 mt-2">
                  Семейство: <span className="italic">{device.plant.species.family}</span>
                </p>
              )}
            </div>
          )}
          {!device.plant.species.description && device.plant.species.family && (
            <div className="text-xs text-neutral-400">
              Семейство: <span className="italic">{device.plant.species.family}</span>
            </div>
          )}
        </section>
      )}

      <RangeToggle range={range} onChange={setRange} />

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Chart
          label="Температура, °C"
          data={data}
          dataKey="temperatureC"
          band={thresholds?.temperatureC}
          bandKeys={['okMin', 'okMax', 'warnMin', 'warnMax']}
          events={events}
        />
        <Chart
          label="Влажность воздуха, %"
          data={data}
          dataKey="humidityPct"
          band={thresholds?.humidityPct}
          bandKeys={['okMin', 'okMax', 'warnMin', 'warnMax']}
          events={events}
        />
        <Chart
          label="Свет, лк"
          data={data}
          dataKey="lux"
          band={thresholds?.lux}
          bandKeys={['okMin', 'okMax', 'warnMin', 'warnMax']}
          events={events}
        />
        <Chart
          label="Почва (raw)"
          data={data}
          dataKey="soilMoistureRaw"
          // Soil's "ok" range is between wet and dry — inverted from other params.
          band={thresholds?.soilMoistureRaw}
          bandKeys={['wet', 'dry', null, 'criticallyDry']}
          events={events}
          inverted
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Журнал ухода</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm text-status-ok underline"
          >Добавить событие</button>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Событий пока нет. Полив датчик увидит сам, когда вы польёте.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-2xl border border-neutral-200 dark:border-neutral-800">
            {events.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                onDelete={async () => {
                  if (!device.plant) return;
                  await api.deleteEvent(device.plant.id, e.id);
                  setEvents((es) => es.filter((x) => x.id !== e.id));
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {showAdd && device.plant && (
        <AddEventSheet
          plantId={device.plant.id}
          onClose={() => setShowAdd(false)}
          onCreated={(ev) => {
            setEvents((es) => [ev, ...es]);
            setShowAdd(false);
          }}
        />
      )}
    </main>
  );
}

function RangeToggle({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const opts: Range[] = [7, 30];
  return (
    <div className="inline-flex rounded-full border border-neutral-200 dark:border-neutral-800 p-1 text-sm">
      {opts.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-3 py-1 rounded-full ${range === r ? 'bg-status-ok text-white' : 'text-neutral-600 dark:text-neutral-400'}`}
        >
          {r} дней
        </button>
      ))}
    </div>
  );
}

interface ChartProps {
  label: string;
  data: { t: number; [k: string]: number | null | undefined }[];
  dataKey: 'temperatureC' | 'humidityPct' | 'lux' | 'soilMoistureRaw';
  band: Record<string, number> | undefined | null;
  bandKeys: Array<string | null>;
  events: CareEvent[];
  inverted?: boolean;
}

function Chart({ label, data, dataKey, band, bandKeys, events, inverted }: ChartProps) {
  const ok = inverted
    ? band ? { from: band[bandKeys[0]!], to: band[bandKeys[1]!] } : null
    : band && bandKeys[0] && bandKeys[1] ? { from: band[bandKeys[0]], to: band[bandKeys[1]] } : null;
  const warn = !inverted && band && bandKeys[2] && bandKeys[3]
    ? { from: band[bandKeys[2]], to: band[bandKeys[3]] }
    : null;
  const alertSoilDry = inverted && band && bandKeys[3] ? band[bandKeys[3]] : null;

  // Snap events to nearest sample for the marker — recharts plots dots at
  // existing x-coordinates only.
  const eventDots = events
    .map((e) => {
      const t = new Date(e.occurredAt).getTime();
      const nearest = data.reduce<{ t: number; v: number | null | undefined } | null>(
        (best, p) => {
          const d = Math.abs(p.t - t);
          if (!best || d < Math.abs(best.t - t)) return { t: p.t, v: p[dataKey] };
          return best;
        }, null);
      return nearest ? { ...e, t: nearest.t, v: nearest.v } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.v != null);

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-3">
      <div className="text-xs text-neutral-500 mb-1">{label}</div>
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
            <YAxis fontSize={10} width={32} domain={['auto', 'auto']} />
            {warn && (
              <ReferenceArea y1={warn.from} y2={warn.to} fill="rgb(234 179 8)" fillOpacity={0.06} />
            )}
            {ok && (
              <ReferenceArea y1={ok.from} y2={ok.to} fill="rgb(34 197 94)" fillOpacity={0.1} />
            )}
            {alertSoilDry != null && (
              <ReferenceArea y1={alertSoilDry} y2={alertSoilDry * 1.4} fill="rgb(239 68 68)" fillOpacity={0.05} />
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
                y={e.v as number}
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
    </div>
  );
}

const KIND_LABEL: Record<CareEvent['kind'], string> = {
  water: 'Полив',
  fertilize: 'Подкормка',
  repot: 'Пересадка',
  moved: 'Переставили',
  other: 'Другое',
};

function EventRow({ event, onDelete }: { event: CareEvent; onDelete: () => Promise<void> }) {
  const d = new Date(event.occurredAt);
  return (
    <li className="flex items-center justify-between p-3 text-sm">
      <div>
        <div className="font-medium">{KIND_LABEL[event.kind]}</div>
        <div className="text-xs text-neutral-500">
          {d.toLocaleString('ru-RU')} · {event.source === 'auto' ? 'автоматически' : 'вручную'}
          {event.note ? ` · ${event.note}` : ''}
        </div>
      </div>
      <button onClick={onDelete} className="text-xs text-neutral-500 hover:text-status-alert">Удалить</button>
    </li>
  );
}

function AddEventSheet({
  plantId,
  onClose,
  onCreated,
}: {
  plantId: string;
  onClose: () => void;
  onCreated: (e: CareEvent) => void;
}) {
  const [kind, setKind] = useState<CareEvent['kind']>('water');
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      const { event } = await api.addEvent(plantId, {
        kind,
        occurredAt: new Date(when).toISOString(),
        note: note.trim() || null,
      });
      onCreated(event);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-sm p-5 space-y-3">
        <h3 className="text-lg font-semibold">Добавить событие</h3>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(KIND_LABEL) as CareEvent['kind'][]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-xl border py-2 text-sm ${kind === k ? 'border-status-ok bg-status-ok/10' : 'border-neutral-200 dark:border-neutral-800'}`}
            >{KIND_LABEL[k]}</button>
          ))}
        </div>
        <label className="block text-xs text-neutral-500">
          Когда
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-base"
          />
        </label>
        <label className="block text-xs text-neutral-500">
          Заметка (опционально)
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2 text-base"
          />
        </label>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 py-2 text-sm">Отмена</button>
          <button onClick={submit} disabled={pending} className="flex-1 rounded-lg bg-status-ok text-white py-2 text-sm font-medium disabled:opacity-50">
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
