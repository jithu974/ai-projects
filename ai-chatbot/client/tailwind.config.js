/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        syntax: {
          bg: '#0B0F19',
          sidebar: '#0F172A',
          card: '#161F36',
          input: '#151D30',
          border: '#1E293B',
          accent: '#06B6D4',
          cyan: '#38BDF8',
          blueBadge: '#1E3A8A'
        }
      }
    }
  },
  plugins: []
};