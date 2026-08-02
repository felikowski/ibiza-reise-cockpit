import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Isla — Dein Ibiza Reise-Cockpit",
  description: "Alle Details für deine Ibiza-Reise: Plan, Buchungen, Orte, Budget, Packliste und Dokumente.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
