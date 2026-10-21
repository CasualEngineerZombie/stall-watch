import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <div className="card auth-card">
        <p className="eyebrow">Reverie3D</p>
        <h1>Stall Watch</h1>
        <p className="muted">
          Pick finishes for your projects. We will tell you when one goes quiet.
        </p>

        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : null}

        <form action={signIn} className="stack">
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
          <button type="submit" className="btn btn-primary">
            Sign in
          </button>
        </form>

        <p className="muted small">
          Accounts are created by Reverie3D. There is no self sign-up.
        </p>
      </div>
    </main>
  );
}
