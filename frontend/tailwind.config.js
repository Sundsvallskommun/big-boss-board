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
  theme: {
    extend: {
      // OBS spacing: överstyr INTE theme.spacing — SK genererar sina komponenter
      // (.sk-btn m.fl.) via theme('spacing') i denna build, så en override blåser
      // upp dem. SK-skalan är px-lik vid 62.5%-roten (spacing-N = N px), så appens
      // markup använder SK-nummer = önskad px (prototypens p-4=16px → p-16).
      colors: {
        // Ljus hårlinje för kort/ytor (= prototypens #e5e5e5). SK saknar en ren
        // ljus border-token; primitiven gray-200 är exakt rätt värde och är en
        // designtoken (ingen hårdkodad hex). Ger border-/bg-/divide-hairline.
        hairline: "var(--sk-colors-primitives-gray-200)",
        // Funktionella trafikljus (ljusa). SK:s semantiska *-DEFAULT är mörka
        // (warning = brun ockra #8C3B12) → renderas som tegelrött. Härled i stället
        // ur SK:s ljusare surface-primary-tokens (ingen hårdkodad hex).
        "status-good": "var(--sk-colors-success-surface-primary-DEFAULT)",
        // Medvetet avsteg från SK-profilen (godkänt av produktägare): SK:s
        // warning-surface-primary läses som orange i trafikljuset. Trafikljuset är
        // funktionell statistik-signal, inte profilfärg, så här används en ren gul
        // hex för att skilja "Bevaka" tydligt från "Åtgärd krävs" (rött).
        "status-warn": "#EAB308",
        "status-alert": "var(--sk-colors-error-surface-primary-DEFAULT)",
      },
    },
  },
};
