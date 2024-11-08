/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      },
      colors: {
        'name-red': '#FF0000',
        'name-blue': '#0000FF',
        'body-black': '#000000',
      }
    },
  },
  plugins: [],
}

