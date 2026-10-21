import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell shell--narrow">
      <section className="empty-state empty-state--roomy">
        <p className="eyebrow">404 / Not found</p>
        <h1 className="display-title">This room is not part of the house.</h1>
        <p>
          The page you followed does not exist, has moved, or is outside your
          organisation. Nothing is broken; there is simply nothing here.
        </p>
        <Link href="/projects" className="btn btn-primary">
          Back to projects
        </Link>
      </section>
    </main>
  );
}
