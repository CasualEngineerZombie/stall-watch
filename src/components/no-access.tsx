import { signOut } from "@/app/auth/actions";

export function NoAccess() {
  return (
    <main className="shell shell--narrow">
      <section className="empty-state empty-state--roomy">
        <p className="eyebrow">No organisation</p>
        <h1 className="display-title">Nothing to show yet.</h1>
        <p>
          Your account is signed in, but it is not a member of any builder or
          staff organisation. That is why there is nothing here. Ask a Reverie3D
          administrator to add you to an org.
        </p>
        <form action={signOut}>
          <button type="submit" className="btn btn-outline">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
