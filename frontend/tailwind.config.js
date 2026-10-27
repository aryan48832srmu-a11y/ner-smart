/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Light government-tech palette.
        // Lower shade = lighter. base-950 is the page background (lightest),
        // base-900 cards (white), base-800 inset, etc.
        base: {
          950: "#eef1f6", // page background
          925: "#f6f8fb", // sidebar / header
          900: "#ffffff", // cards
          800: "#f3f5fa", // inset / table rows
          700: "#e7ecf4", // hover
          600: "#dbe2ee", // pressed / subtle borders
          500: "#c3cdde", // divider emphasis
        },
        accent: {
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        line: "#d4dbe8",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.08)",
        lift: "0 4px 12px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
};