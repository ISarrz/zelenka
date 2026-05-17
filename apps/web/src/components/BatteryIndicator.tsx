import type { BatteryEstimate } from '../api';

// 4-state battery icon. Per docs/design-summary.html: never a percentage,
// status color travels on the icon (not on text). `mid` keeps the neutral
// fill — we don't want a green "all good" flag for a routine state.

interface Props {
  estimate: BatteryEstimate;
  className?: string;
}

const FILL_COUNT: Record<BatteryEstimate, number> = {
  full: 4,
  mid: 3,
  low: 2,
  critical: 1,
};

const COLOR_CLASS: Record<BatteryEstimate, string> = {
  full: 'text-slate-500 dark:text-slate-400',
  mid: 'text-slate-500 dark:text-slate-400',
  low: 'text-status-warn',
  critical: 'text-status-alert',
};

export function BatteryIndicator({ estimate, className }: Props) {
  const cells = FILL_COUNT[estimate];
  const isCritical = estimate === 'critical';
  return (
    <svg
      aria-label={`Заряд: ${LABEL[estimate]}`}
      role="img"
      viewBox="0 0 28 14"
      className={`${COLOR_CLASS[estimate]} ${isCritical ? 'animate-pulse' : ''} ${className ?? ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="0.7" y="0.7" width="23" height="12.6" rx="2" />
      <rect x="24.5" y="4.5" width="2.5" height="5" rx="0.7" fill="currentColor" stroke="none" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={3 + i * 4.7}
          y={3}
          width={3.7}
          height={8}
          rx={0.5}
          fill={i < cells ? 'currentColor' : 'none'}
          stroke="none"
        />
      ))}
    </svg>
  );
}

const LABEL: Record<BatteryEstimate, string> = {
  full: 'полный',
  mid: 'средний',
  low: 'низкий',
  critical: 'критический',
};

export function batteryLabel(estimate: BatteryEstimate): string {
  return LABEL[estimate];
}
