import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type IdSuggestion } from '../api';

type Stage = 'pick' | 'identifying' | 'choose' | 'binding';

export function IdentifyPage() {
  const { deviceId = '' } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('pick');
  const [suggestions, setSuggestions] = useState<IdSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setStage('identifying');
    try {
      const { suggestions } = await api.identify(file);
      setSuggestions(suggestions);
      setStage('choose');
    } catch (err) {
      setError((err as Error).message);
      setStage('pick');
    }
  };

  const pick = async (sci: string | null) => {
    setStage('binding');
    try {
      let speciesId: string | null = null;
      let displayName = 'Растение';
      if (sci) {
        const { species } = await api.resolveSpecies(sci);
        speciesId = species.id;
        displayName = species.commonNameRu ?? species.commonNameEn ?? species.scientificName;
      }
      await api.bindPlant(deviceId, { speciesId, name: displayName });
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setStage('choose');
    }
  };

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <header>
          <h1 className="text-2xl font-semibold">Опознать растение</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Сфотографируйте лист или всё растение — приложение покажет
            кандидаты. Лимит — 3 распознавания в неделю.
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-status-alert/40 p-3 text-sm">
            {error}
          </div>
        )}

        {stage === 'pick' && (
          <div className="space-y-3">
            <label className="block">
              <span className="sr-only">фото растения</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
                className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-status-ok file:px-4 file:py-2 file:text-white"
              />
            </label>
            <button
              onClick={() => pick(null)}
              className="w-full text-sm text-neutral-600 underline"
            >
              Пропустить — задать общий профиль
            </button>
          </div>
        )}

        {stage === 'identifying' && (
          <p className="text-neutral-500">Распознаём…</p>
        )}

        {stage === 'choose' && (
          <div className="space-y-3">
            <h2 className="font-medium">Кажется, это…</h2>
            {suggestions.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Plant.id не нашёл вариантов. Попробуйте другое фото или
                задайте общий профиль.
              </p>
            ) : (
              <ul className="space-y-2">
                {suggestions.map((s) => (
                  <li key={s.scientificName}>
                    <button
                      onClick={() => pick(s.scientificName)}
                      className="w-full flex gap-3 items-center rounded-2xl border border-neutral-200 dark:border-neutral-800 p-3 text-left"
                    >
                      {s.similarImageUrl && (
                        <img
                          src={s.similarImageUrl}
                          alt=""
                          className="w-16 h-16 rounded-xl object-cover"
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-medium italic">{s.scientificName}</div>
                        <div className="text-xs text-neutral-500">
                          {Math.round(s.probability * 100)}% совпадение
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => pick(null)}
              className="w-full text-sm text-neutral-600 underline"
            >
              Ничего не подходит — общий профиль
            </button>
          </div>
        )}

        {stage === 'binding' && (
          <p className="text-neutral-500">Сохраняем…</p>
        )}
      </div>
    </main>
  );
}
