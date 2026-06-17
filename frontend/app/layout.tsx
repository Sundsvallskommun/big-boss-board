import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  // Internt arbetsnamn "Big Boss Board" visas aldrig i UI.
  title: "Dialogstöd",
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
