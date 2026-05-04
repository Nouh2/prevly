import type { Metadata } from "next";
import AuthForm from "@/components/auth/AuthForm";

export const metadata: Metadata = {
  title: "Connexion | Prevly",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
