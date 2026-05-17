import { useEffect } from 'react';

// Modal confirm dialog matching docs/design-summary.html §dialogs. Tone +
// color follow action gravity: danger (red) for destructive, nominal (green)
// for restorative, neutral for non-destructive.

export type DialogTone = 'danger' | 'nominal' | 'neutral';

interface Props {
  open: boolean;
  tone: DialogTone;
  // Tabler icon name for the round badge above the title (e.g. "trash",
  // "arrows-exchange"). The bgColor of the badge follows tone.
  iconSlot: React.ReactNode;
  title: string;
  body: React.ReactNode;
  primaryLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  // While `pending`, the primary button is disabled and shows the spinner.
  pending?: boolean;
}

const PRIMARY_BG: Record<DialogTone, string> = {
  danger: 'bg-[#E24B4A] text-white',
  nominal: 'bg-status-ok text-white',
  neutral: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100',
};

const BADGE_BG: Record<DialogTone, string> = {
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  nominal: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};

export function ConfirmDialog({
  open,
  tone,
  iconSlot,
  title,
  body,
  primaryLabel,
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
  pending = false,
}: Props) {
  // Esc to dismiss
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/55"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white dark:bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="flex justify-center mb-3">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${BADGE_BG[tone]}`}>
            {iconSlot}
          </div>
        </div>
        <div id="confirm-title" className="text-center text-base font-medium leading-tight">{title}</div>
        <div className="text-center text-[13px] text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed">
          {body}
        </div>
        <div className="flex flex-col gap-2 mt-5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium ${PRIMARY_BG[tone]} disabled:opacity-60`}
          >
            {pending ? '…' : primaryLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-transparent border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
