// Compact inline SVG icon set matching the Tabler-style strokes used in
// docs/design-summary.html. We keep just the glyphs the UI actually uses
// rather than pulling in a full icon package.

import type { SVGProps } from 'react';

type IconName =
  | 'plus'
  | 'user'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'droplet'
  | 'sun'
  | 'temperature'
  | 'mist'
  | 'plant'
  | 'list'
  | 'check'
  | 'wifi'
  | 'wifi-off'
  | 'info-circle'
  | 'alert-circle'
  | 'settings'
  | 'upload'
  | 'download'
  | 'plus-square'
  | 'lock'
  | 'arrow-right'
  | 'broadcast'
  | 'mail';

interface Props extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, className, ...rest }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
    ...rest,
  };
  switch (name) {
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'user':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case 'chevron-up':
      return (
        <svg {...common}>
          <path d="M6 15l6-6 6 6" />
        </svg>
      );
    case 'chevron-left':
      return (
        <svg {...common}>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      );
    case 'droplet':
      return (
        <svg {...common}>
          <path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4" />
        </svg>
      );
    case 'temperature':
      return (
        <svg {...common}>
          <path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0z" />
          <path d="M12 16a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'mist':
      return (
        <svg {...common}>
          <path d="M4 8h12M6 12h14M4 16h11M9 20h10" />
        </svg>
      );
    case 'plant':
      // ti-plant-2 silhouette — bottom dome + two side-leaf arcs + tall
      // pointed center leaf. Drawn with a slightly bolder stroke than the
      // other icons so the three lobes read cleanly at small sizes.
      return (
        <svg {...common} strokeWidth={2}>
          <path d="M2 9a10 10 0 1 0 20 0" />
          <path d="M12 19a10 10 0 0 0 -10 -10" />
          <path d="M12 19a10 10 0 0 1 10 -10" />
          <path d="M12 4v15" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M5 12l5 5L20 7" />
        </svg>
      );
    case 'wifi-off':
      return (
        <svg {...common}>
          <path d="M3 3l18 18" />
          <path d="M5 12.5a10 10 0 0 1 4-2.7" />
          <path d="M9 16.5a5 5 0 0 1 6 0" />
          <path d="M19 12.5a10 10 0 0 0-4-2.7" />
          <circle cx="12" cy="20" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'info-circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v4h1" />
        </svg>
      );
    case 'alert-circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case 'wifi':
      return (
        <svg {...common}>
          <path d="M5 12.5a10 10 0 0 1 14 0" />
          <path d="M8.5 15.5a5 5 0 0 1 7 0" />
          <circle cx="12" cy="19" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...common}>
          <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
        </svg>
      );
    case 'plus-square':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case 'broadcast':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2" />
          <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 7 9-7" />
        </svg>
      );
  }
}
