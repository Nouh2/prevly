import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connexion — Prevly",
};

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <a
          href="/"
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', serif",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text)",
            display: "block",
            marginBottom: 24,
          }}
        >
          Prev<span style={{ color: "var(--violet)" }}>ly</span>
        </a>
        <p
          style={{
            fontFamily: "var(--font-epilogue), 'Epilogue', sans-serif",
            fontSize: 15,
            color: "var(--text-muted)",
          }}
        >
          Page de connexion — disponible en V2.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: 20,
            fontFamily: "var(--font-epilogue), 'Epilogue', sans-serif",
            fontSize: 14,
            color: "var(--violet)",
          }}
        >
          Retour à l&apos;accueil
        </a>
      </div>
    </div>
  );
}
