// "Уход" block on the plant card — 4 bullets per docs/design-summary.html
// §plant-card. Driven entirely off CareThresholds; no Perenual prose
// needed (and indeed mostly not available on the free tier).

type Band = Record<string, number> | undefined;

interface Thresholds {
  temperatureC?: Band;
  humidityPct?: Band;
  lux?: Band;
  soilMoistureRaw?: Band;
}

interface Props {
  thresholds: Thresholds | null | undefined;
}

export function SpeciesCare({ thresholds }: Props) {
  if (!thresholds) return null;
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-[11px] font-medium tracking-wider uppercase text-neutral-400 dark:text-neutral-500 mb-3">
        Уход
      </div>
      <div className="space-y-3">
        <Tip icon="☀" {...lightTip(thresholds.lux)} />
        <Tip icon="🌡" {...tempTip(thresholds.temperatureC)} />
        <Tip icon="💧" {...soilTip(thresholds.soilMoistureRaw)} />
        <Tip icon="💨" {...humidityTip(thresholds.humidityPct)} />
      </div>
    </div>
  );
}

function Tip({ icon, title, detail }: { icon: string; title: string; detail: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-base flex-shrink-0 w-5 text-center text-neutral-500">{icon}</span>
      <div className="flex-1">
        <div className="text-sm">{title}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{detail}</div>
      </div>
    </div>
  );
}

function lightTip(band: Band): { title: string; detail: string } {
  if (!band) return { title: 'Свет', detail: 'без особых требований' };
  const okMin = band.okMin ?? 0;
  const okMax = band.okMax ?? 0;
  const title = okMin >= 1000 ? 'Любит яркий свет'
    : okMin >= 300 ? 'Рассеянный свет'
      : 'Терпит полутень';
  return { title, detail: `${fmtLux(okMin)} – ${fmtLux(okMax)} лк, без прямого солнца` };
}

function tempTip(band: Band): { title: string; detail: string } {
  if (!band) return { title: 'Температура', detail: 'комнатная' };
  const okMin = band.okMin ?? 0;
  const okMax = band.okMax ?? 0;
  return {
    title: okMax - okMin <= 8 ? 'Тепло, без перепадов' : 'Широкий диапазон',
    detail: `${okMin}–${okMax}°C круглый год`,
  };
}

function soilTip(band: Band): { title: string; detail: string } {
  if (!band) return { title: 'Полив', detail: 'когда верхний слой подсох' };
  const dry = band.dry ?? 2800;
  const title = dry <= 2400 ? 'Частый полив'
    : dry >= 3400 ? 'Редкий полив'
      : 'Умеренный полив';
  return { title, detail: 'когда почва ниже зоны нормы, до верха зоны нормы' };
}

function humidityTip(band: Band): { title: string; detail: string } {
  if (!band) return { title: 'Влажность воздуха', detail: 'комнатная' };
  const okMin = band.okMin ?? 0;
  const okMax = band.okMax ?? 0;
  const title = okMin >= 55 ? 'Любит влажный воздух'
    : okMin >= 35 ? 'Умеренная влажность'
      : 'Терпит сухой воздух';
  return { title, detail: `${okMin}–${okMax}%, опрыскивайте при сухом воздухе` };
}

function fmtLux(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} k` : String(n);
}
