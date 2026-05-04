import type { Metadata } from "next";
import TftClient from "@/components/tft/TftClient";

export const metadata: Metadata = {
  title: "Tresorerie previsionnelle | Prevly",
  description: "Tableau de flux de tresorerie hebdomadaire Prevly.",
};

export default function TftPage() {
  return <TftClient />;
}
