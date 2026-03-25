/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#1e1e1e',
        panel: '#252525',
        input: '#2d2d2d',
        accent: '#0A84FF',
      },
      borderRadius: {
        'apple': '14px',
      }
    },
  },
  plugins: [],
}
