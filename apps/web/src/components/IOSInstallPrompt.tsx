import { useState } from 'react';
import { isStandalonePWA } from '../lib/push';

// Per the design doc: shown immediately after login on iOS Safari when the
// app is not yet installed. The honest header ("без неё не работают
// push-уведомления") is required so the user understands the cost of
// dismissing — same wording the design doc uses.

const DISMISSED_KEY = 'zelenka_ios_install_dismissed';

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPad on iOS 13+ identifies itself as MacIntel with touch support, hence
  // the extra check.
  const ios = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios;
}

export function shouldShowIOSInstall(): boolean {
  if (!isIOSSafari()) return false;
  if (isStandalonePWA()) return false;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISSED_KEY)) return false;
  return true;
}

export function IOSInstallPrompt({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-sm p-5 space-y-4">
        <header>
          <h2 className="text-lg font-semibold">Добавьте Zelenka на главный экран</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Без этого Safari не отдаёт уведомления — поливать «по будильнику» не получится.
          </p>
        </header>

        <ol className="space-y-3">
          <Step
            n={1}
            active={step >= 0}
            title="Нажмите значок «Поделиться»"
            sub="Внизу экрана в Safari, или сверху на iPad."
            visual={<ShareIcon />}
          />
          <Step
            n={2}
            active={step >= 1}
            title="Прокрутите вниз и выберите «На экран Домой»"
            sub="Иконка с плюсиком."
            visual={<HomeScreenLabel />}
          />
          <Step
            n={3}
            active={step >= 2}
            title="Нажмите «Добавить» в правом верхнем углу"
            visual={null}
          />
        </ol>

        <div className="flex gap-2 pt-1">
          {step < 2 ? (
            <button
              onClick={() => setStep((s) => Math.min(2, s + 1))}
              className="flex-1 rounded-lg bg-status-ok text-white py-2 font-medium"
            >Дальше</button>
          ) : (
            <button
              onClick={() => { localStorage.setItem(DISMISSED_KEY, '1'); onClose(); }}
              className="flex-1 rounded-lg bg-status-ok text-white py-2 font-medium"
            >Готово</button>
          )}
          <button
            onClick={dismiss}
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 py-2 text-sm text-neutral-600 dark:text-neutral-400"
          >Пропустить — без уведомлений</button>
        </div>
      </div>
    </div>
  );
}

function Step({
  n, active, title, sub, visual,
}: {
  n: number;
  active: boolean;
  title: string;
  sub?: string;
  visual: React.ReactNode | null;
}) {
  return (
    <li className={`flex gap-3 items-start ${active ? '' : 'opacity-50'}`}>
      <div className="w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-medium shrink-0">
        {n}
      </div>
      <div className="flex-1">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <span>{title}</span>
          {visual && <span className="inline-flex items-center">{visual}</span>}
        </div>
        {sub && <div className="text-xs text-neutral-500 mt-0.5">{sub}</div>}
      </div>
    </li>
  );
}

// iOS Share icon — square with up arrow, intentionally simple so it's
// recognisable without trying to imitate Apple's SF Symbol exactly.
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 10h2v10h10V10h2" />
    </svg>
  );
}

// Approximation of iOS's "Add to Home Screen" row label — small grey pill so
// the user knows what to look for in the share sheet.
function HomeScreenLabel() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-xs">
      <span className="w-3 h-3 rounded border border-current inline-flex items-center justify-center font-medium">+</span>
      На экран Домой
    </span>
  );
}
