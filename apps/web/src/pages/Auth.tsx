import { useState } from 'react';
import { api } from '../api';

export function AuthPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api.requestMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <main className="min-h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-2xl font-semibold">Письмо отправлено</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Откройте ссылку из письма на <strong>{email}</strong>, чтобы войти.
          </p>
          <p className="text-sm text-neutral-500">
            В dev-режиме ссылка пишется в лог API-контейнера —
            посмотрите <code>docker logs api</code>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Войти</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Введите почту — пришлём ссылку для входа.
        </p>
        <input
          type="email"
          required
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-status-ok"
        />
        {error && <p className="text-sm">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-status-ok text-white py-2 font-medium disabled:opacity-50"
        >
          {pending ? 'Отправляем…' : 'Отправить ссылку'}
        </button>
      </form>
    </main>
  );
}
