import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export function AuthConsumePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Ссылка некорректная.');
      return;
    }
    api
      .consumeMagicLink(token)
      .then(async () => {
        // Pin the user's actual browser timezone on first login so quiet
        // hours / morning digest don't drift if the server moves regions.
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz) await api.updateSettings({ timezone: tz });
        } catch {
          /* timezone is a nice-to-have; never block login on it */
        }
        navigate('/', { replace: true });
      })
      .catch((err: Error) => setError(err.message));
  }, [params, navigate]);

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      {error ? (
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Не удалось войти</h1>
          <p className="text-neutral-600 dark:text-neutral-400">{error}</p>
          <a href="/auth" className="text-status-ok underline">
            Попробовать ещё раз
          </a>
        </div>
      ) : (
        <p className="text-neutral-600 dark:text-neutral-400">Входим…</p>
      )}
    </main>
  );
}
