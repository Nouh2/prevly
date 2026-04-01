import type { Metadata } from "next";
import { Playfair_Display, Epilogue } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const epilogue = Epilogue({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-epilogue",
  display: "swap",
});

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
      <body className={`${playfair.variable} ${epilogue.variable}`}>
        {children}
      </body>
    </html>
  );
}
