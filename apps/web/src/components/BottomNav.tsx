import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { PlantArt } from './PlantArt';

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
        icon="plant"
        onClick={() => navigate('/')}
      />
      <Tab
        active={active === 'feed'}
        label="Лента"
        icon="list"
        onClick={() => navigate('/feed')}
      />
    </nav>
  );
}

function Tab({
  active, label, icon, onClick,
}: {
  active: boolean;
  label: string;
  icon: 'plant' | 'list';
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2 ${
        active ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'
      }`}
    >
      {icon === 'plant' ? (
        <PlantArt className="w-[19px] h-auto" strokeWidth={18} />
      ) : (
        <Icon name={icon} size={19} />
      )}
      <span className={`text-[11px] ${active ? 'font-medium' : ''}`}>{label}</span>
    </button>
  );
}
