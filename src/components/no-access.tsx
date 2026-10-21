import { signOut } from "@/app/auth/actions";

export function NoAccess() {
  return (
    <main className="page">
      <div className="card empty-card">
        <h1>No organisation yet</h1>
        <p className="muted">
          Your account is signed in, but it is not a member of any builder or staff
          organisation. That is why there is nothing to show. Ask a Reverie3D
          administrator to add you to an org.
        </p>
        <form action={signOut}>
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
