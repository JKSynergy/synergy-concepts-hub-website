/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f9f3',
          100: '#dcf2e3',
          200: '#bce4cb',
          300: '#8dd0a8',
          400: '#58b47e',
          500: '#1E8138',
          600: '#1a6d2f',
          700: '#155727',
          800: '#124522',
          900: '#0f391e',
        },
      }
    },
  },
  plugins: [],
};