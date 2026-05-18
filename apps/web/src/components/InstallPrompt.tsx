import { useState } from 'react';
import { Icon } from './Icon';
import { PlantArt } from './PlantArt';
import { isStandalonePWA } from '../lib/push';

// Renders the platform-appropriate "add to home screen" sheet per
// docs/design-summary.html §install. iOS gets the 3-step Safari walkthrough;
// Android gets the single-button card backed by `beforeinstallprompt`.

const DISMISSED_KEY = 'zelenka_install_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

// Capture the deferred Android prompt as early as possible — the event
// fires once on first eligible page-load, so a module-level listener is
// the only way to retain it across React mounts.
let deferredAndroidPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredAndroidPrompt = e as BeforeInstallPromptEvent;
  });
}

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function shouldShowInstall(): 'ios' | 'android' | null {
  if (typeof window === 'undefined') return null;
  if (isStandalonePWA()) return null;
  if (localStorage.getItem(DISMISSED_KEY)) return null;
  if (isIOSSafari()) return 'ios';
  if (deferredAndroidPrompt) return 'android';
  return null;
}

export function InstallPrompt({ onClose }: { onClose: () => void }) {
  const [variant] = useState<'ios' | 'android'>(() =>
    isIOSSafari() ? 'ios' : 'android',
  );

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    onClose();
  };

  // The card sits as a modal-style sheet, but matches the wireframe
  // (single-column white card with rounded corners and the standard chrome
  // strip at top). Backdrop is dimmed so users see this is foreground.
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-sm overflow-hidden border border-neutral-200/70 dark:border-neutral-800">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <span className="w-6 h-6 rounded-full bg-status-ok flex items-center justify-center text-white">
            <PlantArt className="w-[14px] h-auto" strokeWidth={22} />
          </span>
          <span className="text-sm font-medium">Zelenka</span>
        </div>

        {variant === 'ios' ? <IOSBody onSkip={dismiss} onClose={onClose} /> : <AndroidBody onSkip={dismiss} onClose={onClose} />}
      </div>
    </div>
  );
}

function IOSBody({ onSkip, onClose }: { onSkip: () => void; onClose: () => void }) {
  return (
    <>
      <div className="px-5 pt-3.5 pb-1">
        <div className="text-[22px] font-medium leading-tight">
          Добавьте на экран «Домой»
        </div>
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Иначе не будут приходить уведомления — а&nbsp;в&nbsp;них вся польза от датчика.
        </div>
      </div>

      <ol className="px-5 pt-4 pb-1 flex flex-col gap-3.5">
        <StepRow n={1} title="Нажмите кнопку «Поделиться» в Safari">
          <HintChip>
            <Icon name="upload" size={14} />
            <span>значок снизу экрана</span>
          </HintChip>
        </StepRow>
        <StepRow n={2} title="Выберите «На экран Домой»">
          <HintChip>
            <Icon name="plus-square" size={14} />
            <span>На экран «Домой»</span>
          </HintChip>
        </StepRow>
        <StepRow n={3} title="Нажмите «Добавить» в правом верхнем углу">
          <div className="text-[12px] text-neutral-400 mt-1">
            Иконка появится на главном экране телефона
          </div>
        </StepRow>
      </ol>

      <div className="px-5 pt-5 pb-2">
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
        >
          Я добавил, открыть оттуда
        </button>
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center py-3 pb-5 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Пропустить — без уведомлений
      </button>
    </>
  );
}

function AndroidBody({ onSkip, onClose }: { onSkip: () => void; onClose: () => void }) {
  const [pending, setPending] = useState(false);

  const install = async () => {
    const evt = deferredAndroidPrompt;
    if (!evt) { onClose(); return; }
    setPending(true);
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      deferredAndroidPrompt = null;
      if (choice.outcome === 'accepted') {
        onClose();
      } else {
        setPending(false);
      }
    } catch {
      setPending(false);
    }
  };

  return (
    <>
      <div className="flex justify-center pt-6 pb-2">
        <div
          className="w-24 h-24 rounded-3xl bg-status-ok flex items-center justify-center text-white"
          style={{ boxShadow: '0 8px 24px rgba(99,153,34,0.25)' }}
        >
          <PlantArt className="w-[52px] h-auto" strokeWidth={12} />
        </div>
      </div>

      <div className="px-5 pt-4 pb-1 text-center">
        <div className="text-[22px] font-medium leading-tight">
          Добавьте на главный экран
        </div>
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Иначе не будут приходить уведомления — а&nbsp;в&nbsp;них вся польза от датчика.
        </div>
      </div>

      <div className="px-5 pt-5 pb-2">
        <button
          onClick={install}
          disabled={pending}
          className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Icon name="download" size={18} />
          Установить
        </button>
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center py-3 pb-5 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Пропустить — без уведомлений
      </button>
    </>
  );
}

function StepRow({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="shrink-0 w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[13px] font-medium">
        {n}
      </span>
      <div className="flex-1 pt-1">
        <div className="text-[14px] leading-snug">{title}</div>
        {children && <div className="mt-1.5">{children}</div>}
      </div>
    </li>
  );
}

function HintChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 text-[12px] text-neutral-500 dark:text-neutral-400">
      {children}
    </span>
  );
}
