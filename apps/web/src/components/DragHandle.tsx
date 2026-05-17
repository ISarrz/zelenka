import { useRef } from 'react';

// Drag handle per docs/design-summary.html — small chevron-up + label
// centered at the bottom of home content. Activated by tap *or* an upward
// swipe ≥ 40 px. Both gestures route to the same destination.

interface Props {
  label: string;
  onActivate: () => void;
}

const SWIPE_THRESHOLD_PX = 40;

export function DragHandle({ label, onActivate }: Props) {
  const startY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const sy = startY.current;
    if (sy == null) return;
    const ey = e.changedTouches[0]?.clientY ?? sy;
    startY.current = null;
    if (sy - ey >= SWIPE_THRESHOLD_PX) onActivate();
  };

  return (
    <button
      onClick={onActivate}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="flex flex-col items-center gap-0.5 px-4 py-2 text-neutral-400 dark:text-neutral-500 active:text-neutral-700 dark:active:text-neutral-300 touch-pan-x"
      aria-label={label}
    >
      <span className="text-base leading-none">⌃</span>
      <span className="text-xs">{label}</span>
    </button>
  );
}
