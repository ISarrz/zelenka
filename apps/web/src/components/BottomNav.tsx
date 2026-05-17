import { useNavigate } from 'react-router-dom';

// Two-tab bottom strip — Растение / Лента. Sticky at the bottom; pages
// give it the visual real estate by adding 64px of bottom padding.

export type BottomTab = 'plant' | 'feed';

interface Props {
  active: BottomTab;
}

export function BottomNav({ active }: Props) {
  const navigate = useNavigate();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-950/95 backdrop-blur">
      <Tab
        active={active === 'plant'}
        label="Растение"
        symbol="🌱"
        onClick={() => navigate('/')}
      />
      <Tab
        active={active === 'feed'}
        label="Лента"
        symbol="≡"
        onClick={() => navigate('/feed')}
      />
    </nav>
  );
}

function Tab({
  active, label, symbol, onClick,
}: {
  active: boolean; label: string; symbol: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${
        active ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'
      }`}
    >
      <span className="text-lg leading-none">{symbol}</span>
      <span className={`text-[11px] ${active ? 'font-medium' : ''}`}>{label}</span>
    </button>
  );
}
