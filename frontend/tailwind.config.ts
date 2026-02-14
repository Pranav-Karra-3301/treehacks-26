import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}', './lib/**/*.{js,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050816',
        panel: '#0e1328',
        accent: '#4f8cff',
        accentStrong: '#22d3ee',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 12px 30px rgba(5, 8, 22, 0.45)',
      },
      animation: {
        pop: 'pop 180ms ease-out',
      },
      keyframes: {
        pop: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
