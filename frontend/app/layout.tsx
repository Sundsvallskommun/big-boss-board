import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { getThemeCss } from "@/lib/theme-css";

export const metadata: Metadata = {
  // Internt arbetsnamn "Big Boss Board" visas aldrig i UI.
  title: "Samlad bild för dialog — chefsuppföljning",
  description: "Dialogstöd för chefsuppföljning.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <head>
        {/* Designsystemets temavariabler server-side (eliminerar färg-flash vid SSR). */}
        <style dangerouslySetInnerHTML={{ __html: getThemeCss() }} />
        {/* Raleway (rubriker) enligt designsystemet + Geist Mono för etiketter.
            Brödtext är Arial (systemfont) via SK-temat. BYGGPLAN §6 tillåter Google Fonts. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Raleway:wght@500;600;700;800&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a
          href="#huvudinnehall"
          className="sr-only focus:not-sr-only focus:absolute focus:left-16 focus:top-16 focus:z-50 focus:rounded-12 focus:bg-vattjom-surface-primary focus:px-16 focus:py-8 focus:text-white"
        >
          Hoppa till innehållet
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
