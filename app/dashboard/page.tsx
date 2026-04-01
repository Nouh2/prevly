import type { Metadata } from "next";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard — Prevly",
  description: "Votre tableau de bord financier — score de santé, prévisions et flux.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
