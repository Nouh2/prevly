"use client";

import { useState, useEffect } from "react";

const STORE_KEY = "prevly_beta_v2";
const WAITLIST_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxMisllNC4w_qXETF2ZyNy_obKpJUS_KR5LSZBM5uQgUg-cbM-FCizondNN_oZJS-9aJg/exec";
const WAITLIST_SOURCE = "prevly-landing";
const WAITLIST_TIMEOUT_MS = 10000;
const TOTAL_SPOTS = 50;
const BASE_REMAINING = 47;
const LAUNCH_TS = new Date("2026-03-28").getTime();

function getSignups(): { email: string; ts: number }[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

function addSignup(email: string): number {
  const list = getSignups();
  const exists = list.some((s) => s.email === email);
  if (!exists) {
    list.push({ email, ts: Date.now() });
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  }
  return list.length;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

function getRemainingSpots(remoteCount?: number): number {
  const daysSinceLaunch = Math.max(
    0,
    Math.floor((Date.now() - LAUNCH_TS) / 86400000)
  );
  const naturalDecay = Math.min(daysSinceLaunch * 2, 30);
  const localSignups = getSignups().length;
  const base =
    typeof remoteCount === "number"
      ? Math.max(0, TOTAL_SPOTS - remoteCount)
      : BASE_REMAINING - naturalDecay - localSignups;
  return Math.max(base, 3);
}

function goToFinalCTA(): void {
  const section = document.getElementById("final-cta");
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth" });
  setTimeout(() => {
    const ok = document.getElementById("ok-final");
    const input = document.getElementById(
      "input-final"
    ) as HTMLInputElement | null;
    if (input && ok && !ok.classList.contains("visible")) {
      input.focus();
    }
  }, 680);
}

function submitToWaitlist(email: string): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const endpointReady =
      WAITLIST_ENDPOINT &&
      !WAITLIST_ENDPOINT.includes("REPLACE_WITH_YOUR_DEPLOYMENT_ID");
    if (!endpointReady) {
      reject(new Error("waitlist_not_configured"));
      return;
    }
    const callbackName =
      "prevlyWaitlistCallback_" +
      Date.now() +
      "_" +
      Math.floor(Math.random() * 100000);
    const query = [
      "email=" + encodeURIComponent(email),
      "source=" + encodeURIComponent(WAITLIST_SOURCE),
      "page=" + encodeURIComponent(window.location.href),
      "callback=" + encodeURIComponent(callbackName),
    ].join("&");
    const script = document.createElement("script");
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (timeoutId) clearTimeout(timeoutId);
      if (script.parentNode) script.parentNode.removeChild(script);
      try {
        delete (window as unknown as Record<string, unknown>)[callbackName];
      } catch {
        (window as unknown as Record<string, unknown>)[callbackName] = undefined;
      }
    }

    (window as unknown as Record<string, unknown>)[callbackName] = (payload: { ok: boolean }) => {
      cleanup();
      resolve(payload || { ok: false, error: "empty_response" });
    };

    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error("network_error"));
    };
    script.src =
      WAITLIST_ENDPOINT +
      (WAITLIST_ENDPOINT.includes("?") ? "&" : "?") +
      query;

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, WAITLIST_TIMEOUT_MS);

    document.body.appendChild(script);
  });
}

export default function LandingPage() {
  const [spots, setSpots] = useState(BASE_REMAINING);
  const [formSuccess, setFormSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [heroEmail, setHeroEmail] = useState("");
  const [finalEmail, setFinalEmail] = useState("");
  const [heroError, setHeroError] = useState("");
  const [finalError, setFinalError] = useState("");

  useEffect(() => {
    // Restore signup state
    if (getSignups().length > 0) {
      setFormSuccess(true);
    }

    // Init urgency counter
    setSpots(getRemainingSpots());

    // Fetch remote count
    const endpointReady =
      WAITLIST_ENDPOINT &&
      !WAITLIST_ENDPOINT.includes("REPLACE_WITH_YOUR_DEPLOYMENT_ID");
    if (endpointReady) {
      const callbackName = "prevlyCountCallback_" + Date.now();
      const script = document.createElement("script");
      const tid = setTimeout(() => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          delete (window as unknown as Record<string, unknown>)[callbackName];
        } catch {}
      }, 6000);
      (window as unknown as Record<string, unknown>)[callbackName] = (payload: { count?: number }) => {
        clearTimeout(tid);
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          delete (window as unknown as Record<string, unknown>)[callbackName];
        } catch {}
        if (payload && typeof payload.count === "number") {
          setSpots(getRemainingSpots(payload.count));
        }
      };
      script.src =
        WAITLIST_ENDPOINT +
        "?action=count&callback=" +
        encodeURIComponent(callbackName);
      document.body.appendChild(script);
    }

    // Scroll animations
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const heroEls = document.querySelectorAll<HTMLElement>("#hero .fade-up");
    if (prefersReduced) {
      document
        .querySelectorAll<HTMLElement>(".fade-up")
        .forEach((el) => el.classList.add("in"));
    } else {
      requestAnimationFrame(() => {
        setTimeout(() => {
          heroEls.forEach((el) => el.classList.add("in"));
        }, 80);
      });
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.13 }
      );
      document
        .querySelectorAll<HTMLElement>(".fade-up")
        .forEach((el) => {
          if (!el.closest("#hero")) obs.observe(el);
        });
      return () => obs.disconnect();
    }
  }, []);

  async function handleSubmit(
    id: "hero" | "final",
    email: string,
    setError: (e: string) => void
  ) {
    const val = email.trim().toLowerCase();
    setError("");

    if (!isValidEmail(val)) {
      setError("Adresse email invalide.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitToWaitlist(val);
      if (!result || result.ok !== true) {
        throw new Error(result?.error || "submission_failed");
      }
      addSignup(val);
      setFormSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "waitlist_not_configured") {
        setError(
          "Configuration manquante. Vérifiez le script Google Sheets."
        );
      } else {
        setError(
          "Inscription temporairement indisponible. Réessayez dans un instant."
        );
      }
    } finally {
      setSubmitting(false);
    }
    void id;
  }

  return (
    <>
      {/* ── NAVIGATION ── */}
      <nav className="nav">
        <div className="wordmark">
          Prev<span className="wordmark-accent">ly</span>
        </div>
        <button className="nav-cta" onClick={goToFinalCTA}>
          Rejoindre la bêta
        </button>
      </nav>

      {/* ── HERO ── */}
      <section id="hero">
        <div className="container">
          <div className="urgency" id="urgency-top">
            <span className="urgency-dot" />
            <span>
              Il reste <strong>{spots}</strong> places pour la bêta fermée
            </span>
          </div>

          <div className="hero-badge">Co-pilote financier</div>

          <h1 className="hero-h1">
            Votre trésorerie,
            <br />
            <em>sous contrôle.</em>
            <br />
            En permanence.
          </h1>

          <p className="hero-sub">
            Prevly prédit vos flux sur 90 jours, détecte les tensions avant
            qu&apos;elles arrivent, et vous conseille comme votre
            expert-comptable &mdash; mais disponible 24h/24.
          </p>

          {/* Dashboard Demo */}
          <div className="dashboard fade-up">
            <div className="dash-topbar" />
            <div className="dash-head">
              <div className="dash-head-logo">
                Prev<span className="wordmark-accent">ly</span>
              </div>
              <div className="dash-live">
                <div className="dash-live-dot" />
                En direct
              </div>
            </div>
            <div className="dash-body">
              <div className="dash-metrics">
                <div className="dash-metric">
                  <div className="dash-metric-label">Solde actuel</div>
                  <div className="dash-metric-val">13 100 &euro;</div>
                </div>
                <div className="dash-metric">
                  <div className="dash-metric-label">Prévision J+30</div>
                  <div className="dash-metric-val">10 200 &euro;</div>
                  <div className="dash-metric-delta">
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 9 9"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M4.5 7L1 2.5h7L4.5 7z" fill="currentColor" />
                    </svg>
                    &minus;22 % vs. aujourd&apos;hui
                  </div>
                </div>
              </div>

              <div className="dash-score">
                <div className="dash-score-head">
                  <span className="dash-score-label">
                    Score Santé Financière
                  </span>
                  <span className="dash-score-val">
                    68<sub> /100</sub>
                  </span>
                </div>
                <div className="dash-track">
                  <div className="dash-fill" />
                </div>
                <div className="dash-score-legend">
                  <span>Fragile</span>
                  <span>Vigilance</span>
                  <span>Solide</span>
                </div>
              </div>

              <div className="dash-alert">
                <svg
                  className="dash-alert-icon"
                  viewBox="0 0 14 14"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M7 1.5 1.2 12.5h11.6L7 1.5z"
                    stroke="#B05A1E"
                    strokeWidth="1.25"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 5.8v3.2"
                    stroke="#B05A1E"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                  />
                  <circle cx="7" cy="10.5" r=".65" fill="#B05A1E" />
                </svg>
                <div className="dash-alert-text">
                  <strong>Alerte :</strong> échéance URSSAF estimée dans 18
                  jours &mdash; provisionnez 2 340 &euro;.
                </div>
              </div>
            </div>
          </div>

          {/* Hero Form */}
          <div className="urgency" id="urgency-hero">
            <span className="urgency-dot" />
            <span>
              Il reste <strong>{spots}</strong> places pour la bêta fermée
            </span>
          </div>
          <div className="form-wrap" id="wrap-hero">
            {formSuccess ? (
              <div className="success-msg visible" role="status">
                Vous êtes sur la liste &mdash; on vous contacte très vite.
              </div>
            ) : (
              <>
                <form
                  className="email-form"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit("hero", heroEmail, setHeroError);
                  }}
                >
                  <input
                    type="email"
                    className={`email-input${heroError ? " is-error" : ""}`}
                    placeholder="votre@email.fr"
                    autoComplete="email"
                    aria-label="Adresse email"
                    value={heroEmail}
                    onChange={(e) => {
                      setHeroEmail(e.target.value);
                      setHeroError("");
                    }}
                    disabled={submitting}
                  />
                  <button
                    type="submit"
                    className={`btn btn-primary${submitting ? " is-loading" : ""}`}
                    disabled={submitting}
                  >
                    {submitting ? "Inscription..." : "Rejoindre la bêta"}
                  </button>
                </form>
                {heroError && (
                  <p className="error-msg visible" role="alert">
                    {heroError}
                  </p>
                )}
              </>
            )}
            <div className="reassurance" aria-label="Garanties">
              <span>Gratuit 30 jours</span>
              <span>Sans carte bancaire</span>
              <span>Accès bêta limité</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section id="problem">
        <div className="container">
          <h2 className="problem-h2 fade-up">
            78&nbsp;% des TPE rencontrent des difficultés de trésorerie. La
            plupart ne le voient pas venir.
          </h2>
          <div className="stats-grid">
            <div className="stat-block fade-up" data-delay="1">
              <div className="stat-num">4,2M</div>
              <p className="stat-desc">
                de TPE et indépendants en France gèrent leur activité sans
                outil de pilotage structuré.
              </p>
            </div>
            <div className="stat-block fade-up" data-delay="2">
              <div className="stat-num">72&nbsp;%</div>
              <p className="stat-desc">
                pilotent leur trésorerie à vue &mdash; sur Excel, dans un
                tableur improvisé ou de mémoire.
              </p>
            </div>
            <div className="stat-block fade-up" data-delay="3">
              <div className="stat-num">+15&nbsp;%</div>
              <p className="stat-desc">
                de défaillances d&apos;entreprises en 2025. La tension de
                trésorerie en est la première cause.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how">
        <div className="container">
          <p className="label fade-up">Mise en route</p>
          <h2 className="how-h2 fade-up">Opérationnel en 10 minutes.</h2>
          <div className="steps">
            <div className="step fade-up">
              <div className="step-n">01</div>
              <div className="step-body">
                <h3>Importez vos relevés bancaires</h3>
                <p>
                  Glissez vos relevés des 6 derniers mois en CSV. Prevly
                  prend en charge tous les exports standards des banques
                  françaises &mdash; aucun reformatage nécessaire.
                </p>
              </div>
            </div>
            <div className="step fade-up">
              <div className="step-n">02</div>
              <div className="step-body">
                <h3>Obtenez votre score et vos prévisions</h3>
                <p>
                  En moins d&apos;une minute, Prevly analyse vos flux,
                  calcule votre score de santé financière et génère vos
                  prévisions sur 30, 60 et 90 jours.
                </p>
              </div>
            </div>
            <div className="step fade-up">
              <div className="step-n">03</div>
              <div className="step-body">
                <h3>Recevez des alertes, posez vos questions</h3>
                <p>
                  Prevly vous prévient avant chaque tension. Posez vos
                  questions à votre expert-comptable IA &mdash; URSSAF, TVA,
                  cotisations &mdash; en français, sans jargon comptable.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features">
        <div className="container">
          <h2 className="features-h2 fade-up">
            Tout ce dont un indépendant a besoin pour piloter.
          </h2>
          <div className="features-grid">
            <div className="feature fade-up">
              <div className="feature-idx">01</div>
              <h3>Score de santé financière en temps réel</h3>
              <p>
                Un chiffre entre 0 et 100, recalculé à chaque import. Vous
                savez immédiatement où vous en êtes.
              </p>
            </div>
            <div className="feature fade-up" data-delay="1">
              <div className="feature-idx">02</div>
              <h3>Prévision trésorerie IA 30 &mdash; 90 jours</h3>
              <p>
                Modèle entraîné sur vos propres flux, pas des moyennes
                sectorielles génériques.
              </p>
            </div>
            <div className="feature fade-up" data-delay="2">
              <div className="feature-idx">03</div>
              <h3>Alertes proactives avant chaque tension</h3>
              <p>
                URSSAF, TVA, loyer, charges fixes &mdash; Prevly anticipe et
                vous prévient avant chaque échéance.
              </p>
            </div>
            <div className="feature fade-up">
              <div className="feature-idx">04</div>
              <h3>Expert-comptable IA disponible 24h/24</h3>
              <p>
                Posez vos questions en langage naturel. Votre
                expert-comptable IA connaît le droit fiscal et les
                cotisations sociales.
              </p>
            </div>
            <div className="feature fade-up" data-delay="1">
              <div className="feature-idx">05</div>
              <h3>Suivi des factures et probabilité d&apos;encaissement</h3>
              <p>
                Chaque facture en attente est scorée. Prevly vous dit
                lesquelles risquent de ne pas rentrer.
              </p>
            </div>
            <div className="feature fade-up" data-delay="2">
              <div className="feature-idx">06</div>
              <h3>Connexion bancaire automatique</h3>
              <p>
                Import CSV disponible dès la bêta. Connexion directe aux
                banques françaises en V2.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section id="comparison">
        <div className="container">
          <h2 className="comparison-h2 fade-up">
            Pourquoi Prevly plutôt qu&apos;Excel ou votre
            expert-comptable&nbsp;?
          </h2>
          <div className="comp-blocks">
            <div className="comp-block fade-up">
              <div className="comp-before">Excel vous dit où vous en êtes.</div>
              <div className="comp-after">Prevly vous dit où vous serez.</div>
            </div>
            <div className="comp-block fade-up">
              <div className="comp-before">
                Votre expert-comptable intervient après.
              </div>
              <div className="comp-after">Prevly alerte avant.</div>
            </div>
            <div className="comp-block fade-up">
              <div className="comp-before">
                Agicap coûte 149 &euro;+ et cible les PME.
              </div>
              <div className="comp-after">
                Prevly est pensé pour les solos et TPE, dès 79 &euro;/mois.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing">
        <div className="container">
          <h2 className="pricing-h2 fade-up">
            Simple, transparent, sans surprise.
          </h2>
          <p className="pricing-sub fade-up">
            Commencez gratuitement. Aucune carte bancaire requise.
          </p>
          <div className="pricing-grid">
            <div className="pricing-card fade-up">
              <div className="pricing-plan">Trial</div>
              <div className="pricing-price free">Gratuit</div>
              <p className="pricing-period">
                30 jours &middot; accès Pro complet &middot; sans CB
              </p>
              <ul className="pricing-feats">
                <li>Score de santé financière</li>
                <li>Prévisions 30 &mdash; 90 jours</li>
                <li>Alertes URSSAF et TVA</li>
                <li>Expert-comptable IA disponible 24h/24</li>
                <li>Import CSV illimité</li>
              </ul>
              <button
                className="btn btn-outline btn-full"
                onClick={goToFinalCTA}
              >
                Rejoindre la bêta
              </button>
            </div>

            <div className="pricing-card featured fade-up" data-delay="1">
              <div className="pricing-badge">Recommandé</div>
              <div className="pricing-plan">Pro</div>
              <div className="pricing-price">79 &euro;</div>
              <p className="pricing-period">par mois &middot; sans engagement</p>
              <ul className="pricing-feats">
                <li>Tout ce qui est inclus dans Trial</li>
                <li>12 scénarios de prévision</li>
                <li>Historique illimité</li>
                <li>Export comptable PDF</li>
                <li>Support prioritaire</li>
              </ul>
              <button
                className="btn btn-filled btn-full"
                onClick={goToFinalCTA}
              >
                Rejoindre la bêta
              </button>
            </div>

            <div className="pricing-card fade-up" data-delay="2">
              <div className="pricing-plan">Business</div>
              <div className="pricing-price">119 &euro;</div>
              <p className="pricing-period">par mois &middot; sans engagement</p>
              <ul className="pricing-feats">
                <li>Tout ce qui est inclus dans Pro</li>
                <li>Expert humain mensuel (1 h)</li>
                <li>Prévisions sur 12 mois</li>
                <li>Connexion bancaire directe (V2)</li>
                <li>API et intégrations</li>
              </ul>
              <button
                className="btn btn-outline btn-full"
                onClick={goToFinalCTA}
              >
                Rejoindre la bêta
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section id="final-cta">
        <div className="container">
          <div className="final-inner">
            <h2 className="final-h2 fade-up">
              Votre trésorerie
              <br />
              mérite mieux qu&apos;Excel.
            </h2>
            <p className="final-sub fade-up">
              Rejoignez les premiers indépendants à tester Prevly. Accès bêta
              limité.
            </p>
            <div className="urgency fade-up" id="urgency-final">
              <span className="urgency-dot" />
              <span>
                Il reste <strong>{spots}</strong> places pour la bêta fermée
              </span>
            </div>
            <div className="form-wrap fade-up" id="wrap-final">
              {formSuccess ? (
                <div className="success-msg visible" role="status">
                  Vous êtes sur la liste &mdash; on vous contacte très vite.
                </div>
              ) : (
                <>
                  <form
                    className="email-form"
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSubmit("final", finalEmail, setFinalError);
                    }}
                  >
                    <input
                      type="email"
                      className={`email-input${finalError ? " is-error" : ""}`}
                      placeholder="votre@email.fr"
                      autoComplete="email"
                      aria-label="Adresse email"
                      value={finalEmail}
                      onChange={(e) => {
                        setFinalEmail(e.target.value);
                        setFinalError("");
                      }}
                      disabled={submitting}
                    />
                    <button
                      type="submit"
                      className={`btn btn-primary${submitting ? " is-loading" : ""}`}
                      disabled={submitting}
                    >
                      {submitting ? "Inscription..." : "Accès anticipé gratuit"}
                    </button>
                  </form>
                  {finalError && (
                    <p className="error-msg visible" role="alert">
                      {finalError}
                    </p>
                  )}
                </>
              )}
              <div className="reassurance">
                <span>Gratuit 30 jours</span>
                <span>Sans carte bancaire</span>
                <span>Accès bêta limité</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="container">
          <div className="footer-inner">
            <div className="wordmark">
              Prev<span className="wordmark-accent">ly</span>
            </div>
            <p className="footer-meta">
              &copy; 2026 Prevly &middot; contact@prevly.fr
            </p>
            <div className="footer-links">
              <a href="#">Mentions légales</a>
              <a href="#">RGPD</a>
              <a href="#">CGU</a>
              <a href="/dashboard">Accéder au dashboard</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
