/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['Consolas', '"SF Mono"', 'Monaco', 'ui-monospace', 'monospace'],
      },
      colors: {
        // MineGuard Official Brand & Velzon Design Tokens (from OldProj)
        brand: {
          navy: '#182B3A',
          teal: '#176B87',
          tealLight: '#8DC2D1',
          gold: '#E7B64A',
          bg: '#F3F6F8',
          secondaryText: '#6C7B88',
        },
        velzon: {
          sidebar: '#182B3A',
          sidebarHover: '#1F3446',
          sidebarActive: '#176B87',
          sidebarText: '#8797A8',
          sidebarHeading: '#5B6E80',
          topbar: '#FFFFFF',
          bg: '#F3F3F9',
          card: '#FFFFFF',
          border: '#E9EBEC',
          borderLight: '#F3F6F9',
          textMain: '#212529',
          textMuted: '#878A99',
          textHeading: '#495057',
          primary: '#405189',
          primaryHover: '#364473',
          primarySubtle: 'rgba(64, 81, 137, 0.12)',
          success: '#0AB39C',
          successSubtle: '#E6F8F5',
          warning: '#F7B84B',
          warningSubtle: '#FEF8ED',
          danger: '#F06548',
          dangerSubtle: '#FDEEEB',
          info: '#299CDB',
          infoSubtle: '#EAF5FB',
        },
        // Mapped industrial tokens for seamless component compatibility
        industrial: {
          950: '#182B3A',
          900: '#1F3446',
          850: '#263E53',
          800: '#34495E',
          700: '#495057',
          600: '#6C7B88',
          500: '#878A99',
          400: '#ABB9E8',
          300: '#CBD5E1',
          200: '#E9EBEC',
          100: '#F3F3F9',
          50: '#FFFFFF',
        },
        hazard: {
          critical: '#F06548',
          warning: '#F7B84B',
          elevated: '#F7B84B',
          safe: '#0AB39C',
          info: '#299CDB',
        }
      },
      borderRadius: {
        'panel': '0.375rem', // 6px - Velzon standard card radius
        'control': '0.25rem', // 4px
        'pill': '9999px'
      },
      boxShadow: {
        'card': '0 1px 2px rgba(56, 65, 74, 0.15)',
        'topbar': '0 1px 2px rgba(56, 65, 74, 0.08)',
        'dropdown': '0 5px 10px rgba(30, 32, 37, 0.12)',
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
      }
    },
  },
  plugins: [],
}
