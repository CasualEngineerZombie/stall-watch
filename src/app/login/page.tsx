import type { Metadata } from "next";
import {
  OPEN_GRAPH,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
  TWITTER,
} from "@/lib/seo";
import { BrandLockup } from "@/components/brand-lockup";
import { SubmitButton } from "@/components/submit-button";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/login",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: OPEN_GRAPH,
  twitter: TWITTER,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Stall Watch",
    url: `${SITE_URL}/login`,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: "en",
    featureList: [
      "Finish selection tracking",
      "Five-day stall detection",
      "In-app alerts",
    ],
    publisher: {
      "@type": "Organization",
      name: "Reverie3D",
      url: "https://www.reverie3d.com",
    },
  };

  return (
    <main className="auth-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <section className="auth-visual">
        <div className="auth-visual-top">
          <BrandLockup tone="light" />
          <span className="auth-visual-tag">Builder platform</span>
        </div>

        <div className="auth-visual-copy">
          <p className="eyebrow eyebrow--light">Finish selection oversight</p>
          <h1>
            The quiet ones,
            <br />
            brought to light.
          </h1>
          <p className="auth-visual-lede">
            Every finish, every room, every day a project sits still. Reverie3D
            notices before a quiet selection becomes a delayed installation.
          </p>
        </div>

        <div className="auth-visual-foot">
          <span>Reverie3D / Builder Platform</span>
          <span>Internal access only</span>
        </div>

        <span className="auth-watermark" aria-hidden="true">
          01
        </span>
      </section>

      <section className="auth-panel" aria-labelledby="sign-in-heading">
        <div className="auth-form-wrap">
          <p className="eyebrow">Sign in</p>
          <h2 id="sign-in-heading">Welcome back.</h2>
          <p className="auth-intro">
            Access finish selections for your projects and see what has gone
            quiet.
          </p>

          {error ? (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          ) : null}

          <form action={signIn} className="auth-form">
            <label className="field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@builder.test"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <SubmitButton
              className="btn btn-primary btn-block"
              pendingLabel="Signing in…"
            >
              Sign in
            </SubmitButton>
          </form>

          <p className="auth-note">
            Accounts are created by Reverie3D. There is no self sign-up.
          </p>
        </div>
      </section>
    </main>
  );
}
