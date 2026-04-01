export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480 }}>
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
        <h1
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', serif",
            fontSize: "clamp(2rem, 4vw, 3rem)",
            lineHeight: 1.1,
            marginBottom: 12,
          }}
        >
          Page introuvable
        </h1>
        <p
          style={{
            fontFamily: "var(--font-epilogue), 'Epilogue', sans-serif",
            fontSize: 15,
            color: "var(--text-muted)",
            marginBottom: 20,
          }}
        >
          La page demandée n&apos;existe pas ou n&apos;est plus disponible.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            fontFamily: "var(--font-epilogue), 'Epilogue', sans-serif",
            fontSize: 14,
            color: "var(--white)",
            background: "var(--violet)",
            padding: "12px 18px",
            borderRadius: 8,
          }}
        >
          Retour à l&apos;accueil
        </a>
      </div>
    </div>
  );
}
