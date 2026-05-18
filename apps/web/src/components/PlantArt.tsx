// Three-leaf plant artwork used as the Zelenka brand mark — in the status
// ring centrepiece, the small header logo, and the Android install card.
// Source: Frame 1.svg. Painted with currentColor so callers control colour
// via Tailwind `text-*`. strokeWidth is exposed because the viewBox is fixed
// (0 0 179 145) — small renders need a bumped stroke to stay legible.

interface Props {
  className?: string;
  strokeWidth?: number;
}

export function PlantArt({ className, strokeWidth = 10 }: Props) {
  return (
    <svg
      viewBox="0 0 179 145"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden
    >
      <path d="M13.3992 50.9018C10.5239 55.2169 22.0251 126.417 86 124.979C86 124.979 79.3502 93.076 68.0295 78.231C52.6729 58.0937 16.2745 46.5867 13.3992 50.9018Z" />
      <path d="M161.603 51.921C164.48 56.2336 152.912 128.448 87 124.872C87 124.872 93.6537 93.7104 104.981 78.8743C120.347 58.7489 158.726 47.6085 161.603 51.921Z" />
      <path d="M87.2426 12C82.877 12 56.8006 38.5075 67.5973 71.4627C72.9014 87.6525 87.2426 108 87.2426 108C87.2426 108 98.2301 91.8467 103.977 73.6119C115.268 37.791 91.6082 12 87.2426 12Z" />
    </svg>
  );
}
