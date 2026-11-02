/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Professional civic blue
        brand: {
          50: '#eef4fb', 100: '#d9e5f5', 200: '#b5cbeb', 300: '#86a8dc',
          400: '#5481c9', 500: '#3463b3', 600: '#244d98', 700: '#1e3f7c',
          800: '#1c3566', 900: '#1a2e55', 950: '#111d38',
        },
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
      keyframes: {
        'slide-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'toast-in': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        'slide-in': 'slide-in 180ms ease-out',
        'toast-in': 'toast-in 160ms ease-out',
      },
    },
  },
  plugins: [],
};
