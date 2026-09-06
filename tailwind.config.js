/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Tabular figures everywhere numbers matter; a leaderboard where digits
        // shift width as they change is unreadable at a glance.
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0a0c10',
          900: '#0f1218',
          850: '#141822',
          800: '#1b202c',
          700: '#272e3d',
          600: '#3a4356',
          500: '#5b6577',
          400: '#8b95a7',
          300: '#b8c0cf',
          100: '#eef1f6',
        },
        flag: {
          green: '#3ddc84',
          amber: '#ffb020',
          red: '#ff5252',
        },
        accent: '#4da3ff',
        gold: '#e8c15a',
        silver: '#c3ccd8',
        bronze: '#cd8a4e',
      },
    },
  },
  plugins: [],
};
