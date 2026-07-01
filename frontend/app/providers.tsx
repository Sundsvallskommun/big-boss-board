/** Tidigare registrerade detta @sk-web-guis GuiProvider (CSS-variabler + tema).
 *  Nu äger vi tokens via tailwind.config.js + globals.css, så ingen provider behövs.
 *  Behålls som tunn passthrough för att inte ändra layout-trädet. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
