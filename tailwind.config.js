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
          black: '#0f0f0f',
          charcoal: '#141414',
          navy: '#0a0a0a',
          'navy-light': '#1a1a1a',
          white: '#FFFFFF',
          blue: '#0288D1',
          red: '#E53935',
          green: '#388E3C',
          orange: '#F9A825',
        },
      },
      fontFamily: {
        display: ['Syne', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: '1280px',
      },
    },
  },
  plugins: [],
};
