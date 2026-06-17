/** Genererar designsystemets CSS-variabler server-side så första paint får
 *  rätt färgtema. GuiProvider sätter samma variabler vid hydrering (klient),
 *  men gör inget vid SSR — utan detta blir det en färg-flash (FOUC).
 *
 *  Värdena härleds ur paketets defaultTheme (toCSSVar) — inga hårdkodade hex. */
// Importeras direkt ur @sk-web-gui/theme (inte umbrella-paketet) så att
// forms/file-upload-grafen inte dras in i server-bundlen.
import { defaultTheme, toCSSVar } from "@sk-web-gui/theme";

function build(): string {
  // Speglar GuiProviders normalisering för ljust färgschema:
  // colorSchemes plockas bort och schemats colors lyfts upp på temat.
  const scheme = defaultTheme.colorSchemes.light;
  const normalized: Record<string, unknown> = { ...defaultTheme, colors: scheme.colors };
  delete (normalized as { colorSchemes?: unknown }).colorSchemes;

  const computed = toCSSVar(normalized) as { __cssVars: Record<string, string | number> };
  const decls = Object.entries(computed.__cssVars)
    .map(([key, value]) => `${key.startsWith("--") ? key : `--${key}`}:${value}`)
    .join(";");
  return `:root{${decls}}`;
}

// Temat är statiskt — beräkna en gång per process.
let cached: string | null = null;

export function getThemeCss(): string {
  if (cached === null) {
    cached = build();
  }
  return cached;
}
