/** Tailwind med Sundsvalls designsystem-preset.
 *  Tokens (färger, typografi, spacing) kommer från @sk-web-gui/core — inga egna hex.
 *  GuiProvider injicerar CSS-variablerna i runtime; preseten skapar utilities mot dem. */
const { preset } = require("@sk-web-gui/core");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./node_modules/@sk-web-gui/*/dist/**/*.js",
  ],
  presets: [preset()],
};
