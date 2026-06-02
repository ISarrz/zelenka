import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';

// Reusable circular back button. Matches the size/shape of the +/profile
// buttons on Home so back-navigation feels consistent across pages.

export function BackButton({
  onClick,
  className = '',
  ariaLabel = 'Назад',
}: {
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={onClick ?? (() => navigate(-1))}
      aria-label={ariaLabel}
      className={`w-11 h-11 rounded-full border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500 dark:text-neutral-400 active:bg-neutral-100 dark:active:bg-neutral-900 ${className}`}
    >
      <Icon name="chevron-left" size={22} />
    </button>
  );
}
