import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
