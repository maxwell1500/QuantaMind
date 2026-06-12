/** @type {import('tailwindcss').Config} */

// Route the palette through CSS variables (see src/styles/tokens.css) so
// existing utility classes (bg-gray-50, text-blue-700, …) flip with the
// active theme. `white`/`black`/`transparent`/`current` stay literal.
const ch = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const ramp = (family, shades) =>
  Object.fromEntries(shades.map((s) => [s, ch(`${family}-${s}`)]));

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: ch("surface"),
        ink: ch("ink"),
        gray: ramp("gray", [50, 100, 400, 500, 600, 700, 900]),
        blue: ramp("blue", [50, 100, 300, 600, 700, 800, 900]),
        red: ramp("red", [50, 100, 300, 500, 600, 700, 800]),
        amber: ramp("amber", [50, 100, 300, 600, 700, 800]),
        green: ramp("green", [50, 100, 300, 500, 600, 700, 800]),
      },
    },
  },
  plugins: [],
};
