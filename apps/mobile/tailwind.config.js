/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Senior-friendly type scale (see docs/superpowers/plans). [fontSize, lineHeight].
      // Never use a meaningful-text size below `caption` (14px).
      fontSize: {
        caption: ["14px", "20px"],  // secondary info (lower bound)
        body: ["16px", "24px"],     // body text, buttons
        title: ["18px", "26px"],    // product / store names
        headline: ["22px", "30px"], // primary price
        display: ["28px", "36px"],  // page titles
      },
      // Semantic colors with WCAG-AA-friendly contrast.
      colors: {
        brand: "#2563eb",       // primary action blue
        price: "#15803d",       // price green (green-700, higher contrast than 600)
        ink: "#111827",         // primary text
        "ink-soft": "#4b5563",  // secondary text (replaces gray-400)
        warn: "#b45309",        // stale / caution (amber-700)
      },
    },
  },
  plugins: [],
};
