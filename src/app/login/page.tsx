import type { Metadata } from "next";
import { BrandLockup } from "@/components/brand-lockup";
import { signIn } from "./actions";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="auth-shell">
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
            <button type="submit" className="btn btn-primary btn-block">
              Sign in
            </button>
          </form>

          <p className="auth-note">
            Accounts are created by Reverie3D. There is no self sign-up.
          </p>
        </div>
      </section>
    </main>
  );
}
