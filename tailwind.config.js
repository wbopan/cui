/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/web/**/*.{js,ts,jsx,tsx}",
    "./src/web/index.html",
  ],
  theme: {
    extend: {
      keyframes: {
        'slide-up': {
          from: {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.2s ease-out',
      },
    },
  },
  plugins: [],
}