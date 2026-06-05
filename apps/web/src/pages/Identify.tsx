import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type IdSuggestion, type SpeciesSearchHit } from '../api';
import { PlantArt } from '../components/PlantArt';

type Stage = 'pick' | 'identifying' | 'choose' | 'binding' | 'manual';

export function IdentifyPage() {
  const { deviceId = '' } = useParams();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('pick');
  const [suggestions, setSuggestions] = useState<IdSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SpeciesSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (stage !== 'manual') return;
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) { setHits([]); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const { hits } = await api.searchSpecies(query.trim());
        setHits(hits);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, stage]);

  return (
    <main className="min-h-full p-5 max-w-md mx-auto text-neutral-900 dark:text-neutral-100">
      <header className="flex items-center gap-2.5 mb-5">
        <span className="w-9 h-9 rounded-full bg-status-ok flex items-center justify-center text-white">
          <PlantArt className="w-[22px] h-auto" strokeWidth={18} />
        </span>
        <span className="text-base font-medium">Zeleno</span>
      </header>

      {error && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed mb-4">
          {error}
        </div>
      )}

      {stage === 'pick' && (
        <Pick
          onFile={onFile}
          onManual={() => setStage('manual')}
          onSkip={() => pick(null)}
        />
      )}
      {stage === 'identifying' && (
        <CenteredMessage title="Распознаём…" />
      )}
      {stage === 'choose' && (
        <Choose
          suggestions={suggestions}
          onPick={pick}
          onManual={() => setStage('manual')}
          onSkip={() => pick(null)}
        />
      )}
      {stage === 'manual' && (
        <Manual
          query={query} setQuery={setQuery}
          hits={hits} searching={searching}
          onPick={(s) => pick(s)}
          onBack={() => { setStage('pick'); setQuery(''); setHits([]); }}
          onSkip={() => pick(null)}
        />
      )}
      {stage === 'binding' && (
        <CenteredMessage title="Сохраняем…" />
      )}
    </main>
  );
}

function Pick({ onFile, onManual, onSkip }: {
  onFile: (f: File) => void;
  onManual: () => void;
  onSkip: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-medium leading-tight">Опознать растение</h1>
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Сфотографируйте лист или всё растение — приложение покажет кандидаты. Либо найдите вид в каталоге вручную.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
      >
        Сделать фото
      </button>

      <button
        onClick={onManual}
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 py-3.5 text-[15px] font-medium"
      >
        Выбрать вручную из каталога
      </button>

      <div className="border-l-2 border-neutral-200 dark:border-neutral-700 pl-3 text-[11px] text-neutral-400 leading-relaxed">
        Лимит фото-распознаваний — 3 в неделю.
      </div>

      <button
        onClick={onSkip}
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Пропустить — общий профиль
      </button>
    </div>
  );
}

function Choose({ suggestions, onPick, onManual, onSkip }: {
  suggestions: IdSuggestion[];
  onPick: (sci: string) => void;
  onManual: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-medium leading-tight">Кажется, это…</h1>
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Выберите подходящий вариант или найдите вид в каталоге.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          Plant.id не нашёл вариантов. Попробуйте другое фото или выберите вид вручную.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {suggestions.map((s) => (
            <li key={s.scientificName}>
              <button
                onClick={() => onPick(s.scientificName)}
                className="w-full flex gap-3 items-center rounded-2xl border border-neutral-200 dark:border-neutral-800 p-3 text-left"
              >
                {s.similarImageUrl ? (
                  <img
                    src={s.similarImageUrl}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <span className="w-14 h-14 rounded-xl bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium italic truncate">{s.scientificName}</div>
                  <div className="text-[12px] text-neutral-500">
                    {Math.round(s.probability * 100)}% совпадение
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onManual}
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 py-3.5 text-[15px] font-medium"
      >
        Выбрать вручную из каталога
      </button>

      <button
        onClick={onSkip}
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Ничего не подходит — общий профиль
      </button>
    </div>
  );
}

function Manual({
  query, setQuery, hits, searching, onPick, onBack, onSkip,
}: {
  query: string;
  setQuery: (v: string) => void;
  hits: SpeciesSearchHit[];
  searching: boolean;
  onPick: (sci: string) => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-medium leading-tight">Каталог растений</h1>
        <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
          Введите название по-русски, по-английски или на латыни.
        </p>
      </div>

      <input
        autoFocus
        type="search"
        placeholder="Например, хлорофитум"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-status-ok"
      />

      <div className="min-h-[40vh]">
        {query.trim().length < 2 && (
          <p className="text-[12px] text-neutral-400">Минимум 2 символа.</p>
        )}
        {query.trim().length >= 2 && searching && (
          <p className="text-[13px] text-neutral-500">Ищем…</p>
        )}
        {query.trim().length >= 2 && !searching && hits.length === 0 && (
          <p className="text-[13px] text-neutral-500 leading-relaxed">
            Ничего не нашли. Попробуйте другое название или задайте общий профиль.
          </p>
        )}
        {hits.length > 0 && (
          <ul className="flex flex-col gap-2">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => onPick(h.scientificName)}
                  className="w-full flex gap-3 items-center rounded-2xl border border-neutral-200 dark:border-neutral-800 p-3 text-left"
                >
                  {h.defaultImageUrl ? (
                    <img
                      src={h.defaultImageUrl}
                      alt=""
                      className="w-14 h-14 rounded-xl object-cover shrink-0"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                  ) : (
                    <span className="w-14 h-14 rounded-xl bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate">{h.commonName ?? h.scientificName}</div>
                    <div className="text-[12px] text-neutral-500 italic truncate">{h.scientificName}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={onBack}
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        ← Назад к фото
      </button>
      <button
        onClick={onSkip}
        className="w-full text-center py-1 text-[13px] text-neutral-500 dark:text-neutral-400"
      >
        Пропустить — общий профиль
      </button>
    </div>
  );
}

function CenteredMessage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-center">
      <div className="text-[18px] font-medium text-neutral-500 dark:text-neutral-400">{title}</div>
    </div>
  );
}
