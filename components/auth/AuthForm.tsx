"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

interface Props {
  mode: "login" | "signup";
}

let supabaseWarmup: Promise<SupabaseClient | null> | null = null;

function warmSupabaseClient(): Promise<SupabaseClient | null> {
  if (!supabaseWarmup) {
    supabaseWarmup = import("@/lib/supabase/client").then(({ getSupabaseBrowserClient }) =>
      getSupabaseBrowserClient()
    );
  }
  return supabaseWarmup;
}

export default function AuthForm({ mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  useEffect(() => {
    router.prefetch("/dashboard");

    const warm = () => {
      void warmSupabaseClient();
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }

    const id = globalThis.setTimeout(warm, 500);
    return () => globalThis.clearTimeout(id);
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    setLoading(true);

    const supabase = await warmSupabaseClient();
    if (!supabase) {
      setError("Supabase n'est pas configure. Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caracteres.");
      setLoading(false);
      return;
    }

    try {
      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setMessage("Compte cree. Verifiez votre email pour confirmer l'inscription.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (signInError) throw signInError;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de continuer pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="auth-logo">
          Prev<span>ly</span>
        </Link>
        <div className="auth-head">
          <h1>{isSignup ? "Creer un compte" : "Connexion"}</h1>
          <p>
            {isSignup
              ? "Sauvegardez vos imports, votre profil fiscal et votre TFT dans Supabase."
              : "Retrouvez votre dashboard et votre TFT depuis n'importe quel poste."}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onFocus={() => void warmSupabaseClient()}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onFocus={() => void warmSupabaseClient()}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}
          {message && <p className="auth-success" role="status">{message}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Chargement..." : isSignup ? "Creer mon compte" : "Se connecter"}
          </button>
        </form>

        <p className="auth-switch">
          {isSignup ? "Deja un compte ?" : "Pas encore de compte ?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"}>
            {isSignup ? "Se connecter" : "Creer un compte"}
          </Link>
        </p>
      </section>
    </main>
  );
}
