import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Traffic light tokens — used on rings, borders, icons. Never on body
        // text, per the design doc ("Status color is carried by ring / cell
        // border / icons, never by text").
        status: {
          ok: '#22c55e',
          warn: '#eab308',
          alert: '#ef4444',
          cold: '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};

export default config;
