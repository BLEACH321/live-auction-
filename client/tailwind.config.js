/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: '#07080c',        // Cyberpunk dark space background
          panel: '#0e111a',     // Slate-panel translucent card base
          border: 'rgba(255, 107, 0, 0.2)', // Sleek glowing orange tech border
          accent: '#ff6b00',    // Neon Orange primary
          glow: '#00f0ff',      // Neon Cyan secondary
          glowPink: '#ff1a40',  // Neon Pink highlight
          glowGreen: '#00ff66', // Neon Green success status
          textMuted: '#94a3b8',
        }
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Orbitron"', '"Chakra Petch"', '"Rajdhani"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      }
    },
  },
  plugins: [],
}
