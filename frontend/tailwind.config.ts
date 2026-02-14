import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      fontSize: {
        'hero': ['4rem', { lineHeight: '1.05', letterSpacing: '-0.04em', fontWeight: '700' }],
        'hero-mobile': ['2.5rem', { lineHeight: '1.08', letterSpacing: '-0.035em', fontWeight: '700' }],
        'heading': ['2.25rem', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '600' }],
        'subheading': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '400' }],
      },
      colors: {
        gray: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(0,0,0,0.04)',
        'card': '0 4px 24px rgba(0,0,0,0.06)',
        'elevated': '0 8px 60px -12px rgba(0,0,0,0.12)',
        'chat': '0 12px 80px -16px rgba(0,0,0,0.1)',
      },
      animation: {
        'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'bounce-dot': 'bounceDot 1.4s infinite ease-in-out both',
        'aurora-drift': 'auroraDrift 12s ease-in-out infinite alternate',
        'aurora-drift-2': 'auroraDrift2 10s ease-in-out infinite alternate-reverse',
        'marquee': 'marquee 30s linear infinite',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        bounceDot: {
          '0%, 80%, 100%': { transform: 'scale(0)' },
          '40%': { transform: 'scale(1)' },
        },
        auroraDrift: {
          '0%': { transform: 'translateX(-5%) scaleY(1)' },
          '50%': { transform: 'translateX(3%) scaleY(1.05)' },
          '100%': { transform: 'translateX(-2%) scaleY(0.97)' },
        },
        auroraDrift2: {
          '0%': { transform: 'translateX(4%) scaleY(0.97)' },
          '50%': { transform: 'translateX(-3%) scaleY(1.03)' },
          '100%': { transform: 'translateX(2%) scaleY(1)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
