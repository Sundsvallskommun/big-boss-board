"use client";

import { GuiProvider, ColorSchemeMode } from "@sk-web-gui/react";

/** Registrerar designsystemets tema och CSS-variabler. Ljust färgschema (publik tjänst). */
export function Providers({ children }: { children: React.ReactNode }) {
  return <GuiProvider colorScheme={ColorSchemeMode.Light}>{children}</GuiProvider>;
}
