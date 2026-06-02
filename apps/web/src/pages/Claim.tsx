import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { PlantArt } from '../components/PlantArt';

// Lands the QR scan: ?t=<deviceToken> printed on the sensor's sticker.
// If the user isn't logged in, we bounce them through /auth?next=… so the
// magic-link consume page returns them here and finishes the claim. The
// firmware has the same token in NVS, so after claim the captive portal
// only needs Wi-Fi creds — no manual token entry anywhere.

type Phase = 'pending' | 'success' | 'unknown' | 'taken' | 'error';

export function ClaimPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('pending');

  useEffect(() => {
    const token = params.get('t');
    if (!token) {
      setPhase('error');
      return;
    }

    const run = async () => {
      try {
        await api.me();
      } catch {
        // Stash the token client-side instead of carrying it through the
        // magic-link URL — Resend's click-tracker rewrites links and can
        // strip our `&next=…` query string. AuthConsume picks this up after
        // a successful login.
        try { localStorage.setItem('zelenka_pending_claim', token); } catch { /* ok */ }
        const here = `/claim?t=${encodeURIComponent(token)}`;
        navigate(`/auth?next=${encodeURIComponent(here)}`, { replace: true });
        return;
      }

      try {
        const { device } = await api.claimDevice(token);
        setPhase('success');
        // Pass `?wait=1` through only if it was present on this /claim URL
        // — that signals "user is coming back from the captive-portal saved
        // page". A fresh QR scan has no wait param and starts at activation
        // so the user can walk through power-on → wifi-connect properly.
        const wait = params.get('wait') === '1' ? '?wait=1' : '';
        navigate(`/devices/${device.id}/setup${wait}`, { replace: true, state: { device } });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 404) setPhase('unknown');
        else if (status === 409) setPhase('taken');
        else setPhase('error');
      }
    };

    run();
  }, [params, navigate]);

  return (
    <main className="min-h-full flex items-center justify-center p-6 max-w-md mx-auto">
      <div className="text-center space-y-5">
        <div className="flex justify-center">
          <span className="w-16 h-16 rounded-full bg-status-ok flex items-center justify-center text-white">
            <PlantArt className="w-9 h-auto" strokeWidth={16} />
          </span>
        </div>

        {phase === 'pending' && (
          <>
            <h1 className="text-xl font-medium">Привязываем датчик…</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Секунду — забираем устройство на ваш аккаунт.
            </p>
          </>
        )}
        {phase === 'unknown' && (
          <>
            <h1 className="text-xl font-medium">Не нашли такой датчик</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Похоже, ссылка с коробки повреждена. Попробуйте отсканировать QR ещё раз или напишите в поддержку.
            </p>
            <SupportLink />
          </>
        )}
        {phase === 'taken' && (
          <>
            <h1 className="text-xl font-medium">Датчик уже привязан</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Этим датчиком уже пользуется другой аккаунт. Если это ваш — войдите в тот аккаунт, либо обратитесь в поддержку.
            </p>
            <SupportLink />
          </>
        )}
        {phase === 'error' && (
          <>
            <h1 className="text-xl font-medium">Не получилось</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Что-то пошло не так. Перезагрузите страницу или попробуйте позже.
            </p>
            <SupportLink />
          </>
        )}
      </div>
    </main>
  );
}

function SupportLink() {
  return (
    <a
      href="https://t.me/Sarrz0"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block mt-2 text-[13px] text-status-ok hover:underline"
    >
      Поддержка в Telegram — @Sarrz0
    </a>
  );
}
