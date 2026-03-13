/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Gamma Flow Capital inspired – dark trading UI
        surface: {
          DEFAULT: '#f8fafc',
          dark: '#0f172a',
        },
        panel: {
          DEFAULT: '#ffffff',
          dark: '#1e293b',
        },
        border: {
          DEFAULT: '#e2e8f0',
          dark: '#334155',
        },
        accent: '#0ea5e9',
        'accent-dark': '#38bdf8',
      },
    },
  },
  plugins: [],
};
