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
        minecraft: {
          emerald: '#10b981',
          green: '#22c55e',
          dirt: '#78350f',
          stone: '#374151',
          obsidian: '#0f172a',
          portal: '#a855f7',
          redstone: '#ef4444',
          gold: '#f59e0b',
          diamond: '#06b6d4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'glow-emerald': '0 0 30px -5px rgba(16, 185, 129, 0.3)',
        'glow-cyan': '0 0 30px -5px rgba(6, 182, 212, 0.3)',
        'glow-purple': '0 0 30px -5px rgba(168, 85, 247, 0.3)',
      },
    },
  },
  plugins: [],
};
