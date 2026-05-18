import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PlantArt } from '../components/PlantArt';

export function LandingPage() {
  const navigate = useNavigate();

  const scrollToHow = () => {
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="min-h-full max-w-md mx-auto">
      <header className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-status-ok flex items-center justify-center text-white">
            <PlantArt className="w-[22px] h-auto" strokeWidth={18} />
          </span>
          <span className="text-base font-medium">Zelenka</span>
        </div>
        <button
          onClick={() => navigate('/auth')}
          className="text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          Войти
        </button>
      </header>

      <section className="px-4 pt-2">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-56 h-56 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center overflow-hidden">
            <HeroIllustration />
          </div>
        </div>

        <div className="text-center px-6 pt-2">
          <h1 className="text-2xl font-medium leading-tight">
            Растения скажут, что&nbsp;им нужно
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2.5 leading-relaxed">
            Датчик в горшке следит за условиями. Приложение скажет,
            когда полить, переставить или опрыскать.
          </p>
        </div>

        <div className="pt-5">
          <button
            onClick={() => navigate('/auth')}
            className="w-full rounded-lg bg-status-ok text-white py-3.5 text-[15px] font-medium"
          >
            У меня есть датчик
          </button>
        </div>

        <button
          onClick={scrollToHow}
          className="w-full flex items-center justify-center gap-1 pt-2 pb-6 text-[13px] text-neutral-500 dark:text-neutral-400"
        >
          <span>Как это работает</span>
          <Icon name="chevron-down" size={14} />
        </button>
      </section>

      <section
        id="how-it-works"
        className="px-6 pt-4 pb-12 border-t border-neutral-200/70 dark:border-neutral-800"
      >
        <h2 className="text-lg font-medium pt-6 pb-4">Как это работает</h2>

        <ol className="flex flex-col gap-5">
          <Step
            n={1}
            title="Датчик в горшке"
            body="Один раз ставите в субстрат рядом с растением. Дальше всё сам — Wi-Fi, измерения, питание от батареи."
          />
          <Step
            n={2}
            title="Слушаем растение"
            body="Температура, влажность воздуха, свет и влажность почвы — раз в десять минут, без вашего участия."
          />
          <Step
            n={3}
            title="Подсказка с цифрой"
            body="Когда нужно действовать — приходит короткий пуш: «Полейте 150 мл» или «Переставьте ближе к окну»."
          />
        </ol>
      </section>
    </main>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[13px] font-medium">
        {n}
      </span>
      <div className="flex-1 pt-0.5">
        <div className="text-[15px] font-medium leading-snug">{title}</div>
        <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
          {body}
        </div>
      </div>
    </li>
  );
}

// Hero artwork for the landing — a plant rising from a pile of soil. Source:
// /home/ino/Downloads/Frame 2.svg. Colours are baked in (greens for foliage,
// browns for soil) so it reads the same in light and dark mode.
function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 156 241"
      fill="none"
      className="w-auto h-[78%]"
      aria-hidden
    >
      <path d="M58.3596 105C64.0419 112.649 65.7908 123.996 66.2776 131.899C66.5949 137.052 62.4076 141.085 57.2694 140.588C48.1894 139.71 34.5127 137.036 26.8596 129C14.7834 116.32 8.17215 93 14.3596 88.5C19.8595 84.5 45.3595 87.5 58.3596 105Z" fill="#91C83C" stroke="#91C83C" strokeWidth="6" strokeLinecap="round" />
      <path d="M119.156 37.7574C115.393 39.3395 110.777 39.4303 106.808 39.042C101.669 38.5395 98.6801 33.4175 100.753 28.6891C102.678 24.2994 105.658 19.3824 109.955 16.9222C118.703 11.9137 132.68 11.4016 134.367 15.465C135.867 19.0769 130.733 32.8899 119.156 37.7574Z" fill="#91C83C" stroke="#91C83C" strokeWidth="6" strokeLinecap="round" />
      <circle cx="131.5" cy="217.5" r="12.5" fill="#A55023" />
      <path d="M71.3596 46.5C77.1629 54.3122 79.3549 66.8112 80.1819 75.3777C80.6887 80.6281 76.5708 84.9347 71.3112 84.5341C62.2849 83.8466 48.9186 81.4371 41.3596 73.5C29.2834 60.8198 25.0018 35.1693 29.3596 32C32.094 30.0113 58.3596 29 71.3596 46.5Z" fill="#91C83C" stroke="#91C83C" strokeWidth="6" strokeLinecap="round" />
      <path d="M96.3594 91.5C85.3509 102.605 83.012 111.219 85.3596 130C86.3595 138 113.86 135 130.36 121C136.86 115.485 143.36 82 140.859 82C123.09 82 104.786 83 96.3594 91.5Z" fill="#4B8C41" stroke="#4B8C41" strokeWidth="6" strokeLinecap="round" />
      <path d="M83.3596 172.5C83.3596 172.5 83.3596 166.829 83.3596 158M122.36 20.5C122.36 20.5 83.3596 46 83.3596 60C83.3596 64.6737 83.3596 74.5048 83.3596 86.5M30.3596 34L83.3596 86.5M83.3596 86.5C83.3596 109.385 83.3596 140.148 83.3596 158M15.8596 90.5L83.3596 158" stroke="#5FAA46" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="83.3596" cy="181.5" rx="10.5" ry="9.5" fill="#D26E28" />
      <ellipse cx="67.8596" cy="190.5" rx="11" ry="11.5" fill="#D26E28" />
      <ellipse cx="108.5" cy="205" rx="13.5" ry="15" fill="#A55023" />
      <ellipse cx="121.5" cy="210" rx="13.5" ry="15" fill="#A55023" />
      <ellipse cx="98.8596" cy="190.5" rx="12" ry="12.5" fill="#A55023" />
      <circle cx="53.3596" cy="202.5" r="12.5" fill="#D26E28" />
      <circle cx="66.3596" cy="204.5" r="12.5" fill="#D26E28" />
      <circle cx="83.3596" cy="197.5" r="12.5" fill="#D26E28" />
      <circle cx="95.5" cy="206.5" r="12.5" fill="#D26E28" />
      <circle cx="82.3596" cy="214.5" r="12.5" fill="#D26E28" />
      <circle cx="58.3596" cy="217.5" r="12.5" fill="#D26E28" />
      <circle cx="44.3596" cy="218.5" r="12.5" fill="#D26E28" />
      <circle cx="71.3596" cy="218.5" r="12.5" fill="#D26E28" />
      <circle cx="95.3596" cy="219.5" r="12.5" fill="#D26E28" />
      <circle cx="106.5" cy="216.5" r="12.5" fill="#D26E28" />
      <circle cx="118.5" cy="221.5" r="12.5" fill="#D26E28" />
      <ellipse cx="33.3596" cy="213" rx="13.5" ry="13" fill="#D26E28" />
      <circle cx="68.8596" cy="197" r="5" fill="#A55023" />
      <circle cx="89" cy="218" r="5" fill="#A55023" />
      <circle cx="55.8596" cy="214" r="5" fill="#A55023" />
    </svg>
  );
}
