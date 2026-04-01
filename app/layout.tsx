import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prevly — Co-pilote financier IA pour indépendants",
  description:
    "Prevly prédit vos flux sur 90 jours, détecte les tensions avant qu'elles arrivent, et vous conseille comme votre expert-comptable — mais disponible 24h/24.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
