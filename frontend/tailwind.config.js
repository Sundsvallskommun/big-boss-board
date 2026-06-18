/** Tailwind med Sundsvalls designsystem-preset.
 *  Tokens (färger, typografi, spacing) kommer från @sk-web-gui/core — inga egna hex.
 *  GuiProvider injicerar CSS-variablerna i runtime; preseten skapar utilities mot dem. */
const { preset } = require("@sk-web-gui/core");
const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./node_modules/@sk-web-gui/*/dist/**/*.js",
  ],
  presets: [preset()],
  theme: {
    extend: {
      // SK-preseten mappar spacing till N/10 rem (p-4 = 0.4rem), så all layout
      // blir ihoptryckt jämfört med prototypen (som kör default-Tailwind via CDN).
      // Återställ default-skalan för utilities; SK-komponenterna använder
      // var(--sk-spacing-*) direkt i sin egen CSS och påverkas inte.
      spacing: defaultTheme.spacing,
      colors: {
        // Ljus hårlinje för kort/ytor (= prototypens #e5e5e5). SK saknar en ren
        // ljus border-token; primitiven gray-200 är exakt rätt värde och är en
        // designtoken (ingen hårdkodad hex). Ger border-/bg-/divide-hairline.
        hairline: "var(--sk-colors-primitives-gray-200)",
      },
    },
  },
};
