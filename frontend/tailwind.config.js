/** @type {import('tailwindcss').Config} */
export default {
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
          500: '#1E8138', // Main primary color
          600: '#1a6d2f',
          700: '#155727',
          800: '#124522',
          900: '#0f391e',
        },
        // Dark mode specific colors
        dark: {
          50: '#1a1a1a',
          100: '#0f0f0f',
          200: '#000000',
          800: '#1a1a1a',
          900: '#000000',
        }
      }
    },
  },
  plugins: [],
}