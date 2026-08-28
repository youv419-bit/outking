import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#050506',
          900: '#0a0a0c',
          850: '#101013',
          800: '#16161a',
          700: '#232329',
        },
        gold: {
          100: '#f7ecd2',
          200: '#efdcae',
          300: '#e3c583',
          400: '#d4ac5c',
          500: '#c08f3a',
          600: '#96682a',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -20px rgba(0,0,0,0.9)',
        gold: '0 0 0 1px rgba(212,172,92,0.35), 0 12px 50px -12px rgba(212,172,92,0.35)',
      },
      keyframes: {
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGold: {
          '0%,100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        sweep: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
      },
      animation: {
        riseIn: 'riseIn .5s cubic-bezier(.16,1,.3,1) both',
        pulseGold: 'pulseGold 2.4s ease-in-out infinite',
        sweep: 'sweep 2.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
