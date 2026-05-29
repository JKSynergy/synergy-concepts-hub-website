/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        sch: {
          black: '#0B0F19',
          charcoal: '#111827',
          navy: '#0B0F19',
          'navy-light': '#1E293B',
          surface: '#1E293B',
          white: '#F8FAFC',
          muted: '#94A3B8',
          blue: '#0EA5E9',
          red: '#E53935',
          green: '#388E3C',
          orange: '#F59E0B',
        },
      },
      fontFamily: {
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: '1320px',
      },
    },
  },
  plugins: [],
};
