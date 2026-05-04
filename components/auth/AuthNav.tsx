"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setEmail(null);
    router.push("/");
    router.refresh();
  };

  if (!ready) return null;

  if (!email) {
    return (
      <div className="auth-nav">
        <Link href="/login">Connexion</Link>
      </div>
    );
  }

  return (
    <div className="auth-nav signed-in">
      <span title={email}>{email}</span>
      <button onClick={signOut}>Deconnexion</button>
    </div>
  );
}
