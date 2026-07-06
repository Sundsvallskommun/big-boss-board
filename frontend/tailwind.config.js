/** Lättviktigt token-lager i Sundsvalls visuella språk.
 *
 *  Tidigare drevs all styling av @sk-web-gui-preseten (designsystemet). Nu äger vi
 *  tokens själva: ett litet, fristående lager som hämtar det *visuella grundintrycket*
 *  från Sundsvalls kommuns profil (vattjom-blå, ink, gråskala, status-färger) utan att
 *  dra in hela designsystemet. Ingen runtime-beroende av @sk-web-gui kvar.
 *
 *  Spacing/radie är en px-lik skala (token-N = N px) som speglar designsystemets
 *  62.5%-rot-konvention — så all befintlig markup behåller exakt sina mått
 *  (p-16=16px, gap-12=12px, rounded-12=12px, h-48=48px). Roten är dock vanlig 16px
 *  här (inte 62.5%), så typografi anges i absoluta px.
 *
 *  Grafernas seriefärger ligger som hex direkt i respektive chart-fil. */

// Px-lik skala: N → "N px". Genereras tätt så ingen utility saknas.
const pxScale = (max) => {
  const s = { px: "1px", "0.5": "0.5px", "1.5": "1.5px", "2.5": "2.5px", "3.5": "3.5px" };
  for (let i = 0; i <= max; i++) s[i] = `${i}px`;
  return s;
};

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    // Ersätter Tailwinds default-spacing helt (px-lik skala). width/height/inset m.fl.
    // ärver denna och behåller dessutom full/screen/fractions/min/max/fit.
    spacing: pxScale(400),
    borderRadius: {
      none: "0px",
      sm: "4px",
      DEFAULT: "6px",
      md: "8px",
      lg: "12px",
      xl: "16px",
      full: "9999px",
      ...pxScale(64),
    },
    extend: {
      fontFamily: {
        // Brödtext/fält/knappar = Arial (kommunens sans). Rubriker = Raleway.
        // Etiketter/mono = Geist Mono. (Raleway + Geist Mono laddas i layout.tsx.)
        sans: ["Arial", "Helvetica", "sans-serif"],
        header: ["Raleway", "Arial", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      // Absoluta px (roten är 16px). Kalibrerade mot designsystemets typskala.
      fontSize: {
        small: ["14px", { lineHeight: "1.5" }],
        base: ["16px", { lineHeight: "1.55" }],
        large: ["19px", { lineHeight: "1.5" }],
        h4: ["22px", { lineHeight: "1.3" }],
        h3: ["28px", { lineHeight: "1.25" }],
        h2: ["34px", { lineHeight: "1.2" }],
        h1: ["42px", { lineHeight: "1.12" }],
      },
      colors: {
        // --- Ytor ---
        background: {
          200: "#F0F0F0", // grå sidyta (gray.100)
          content: "#FFFFFF", // vita kort
        },
        // --- Text-ink (gråskala ur kommunens palett) ---
        dark: {
          primary: "#1F1F25", // gray.900
          secondary: "#51515C", // gray.600 — dämpad sekundärtext, AA mot vitt
        },
        // --- Linjer ---
        hairline: "#E5E5E5", // gray.200, tunn kortram
        divider: "#B7B7BA", // gray.300, tydligare avdelare
        // --- Fokusring ---
        ring: "#0C8CED",
        // --- Vattjom (kommunens primära blå) ---
        vattjom: {
          "surface-primary": "#0055B8", // ytor/ramar/fyllnad
          "surface-primary-hover": "#004A99", // hover på primära knappar/länkar
          "text-primary": "#00427D", // text/ikoner (mörkare → AA)
          "background-100": "#E6EEF7", // ljus blå ton
        },
        // --- Funktionella status (semantiska ytor + text) ---
        error: {
          DEFAULT: "#971A1A",
          text: "#971A1A",
          "background-200": "#F7E4E4",
        },
        success: {
          DEFAULT: "#1E8A4E",
          text: "#1E6E40", // mörkare grön text för AA
          "background-200": "#E3F1E8",
          "background-300": "#CDE6D6",
        },
        warning: {
          DEFAULT: "#8C3B12",
          text: "#8C3B12",
          "background-100": "#FBEDE4",
        },
        // --- Trafikljus (ljusa funktionella signaler) ---
        "status-good": "#1E8A4E",
        "status-warn": "#EAB308", // medvetet rent gult (skilj "Bevaka" från rött)
        "status-alert": "#D32F2F",
      },
    },
  },
};
