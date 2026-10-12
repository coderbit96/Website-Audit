import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-page" id="main-content">
      <div aria-hidden="true" className="page-glow" />
      <div className="auth-grid">
        <section className="auth-story">
          <Link className="brand-link" href="/" aria-label="SiteSignal home">
            <span className="brand-mark">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 17V7m5 10v-4m5 4V9m5 8V4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>SiteSignal</span>
          </Link>

          <div className="auth-story-copy">
            <span className="auth-eyebrow">Website intelligence</span>
            <h2>Clarity for every signal your website sends.</h2>
            <p>
              Bring SEO, performance, accessibility, security, and mobile
              quality into one focused workspace.
            </p>
          </div>

          <p className="auth-trust">Secure sessions · Argon2id protection</p>
        </section>

        <section className="auth-panel">
          <div className="auth-card">
            <p className="auth-card-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="auth-card-description">{description}</p>
            {children}
            <div className="auth-footer">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
