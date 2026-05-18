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
          ok: '#639922',
          'ok-ink': '#3F6315',
          warn: '#EF9F27',
          'warn-ink': '#BA7517',
          alert: '#E24B4A',
          'alert-ink': '#A52A29',
          cold: '#888780',
          'cold-soft': '#B4B2A9',
          recovery: '#378ADD',
          'recovery-ink': '#185FA5',
        },
      },
    },
  },
  plugins: [],
};

export default config;
