import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { signOut } from "@/app/auth/actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stall Watch",
  description:
    "Finish selections for your projects, and see when one goes quiet.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, orgLabel, isStaff } = await getSession();

  return (
    <html lang="en">
      <body>
        {user ? (
          <header className="app-header">
            <Link href="/projects" className="brand">
              Stall Watch
            </Link>
            <nav className="app-nav" aria-label="Main">
              <Link href="/projects">Projects</Link>
              <Link href="/alerts">Alerts</Link>
              {isStaff ? <Link href="/detector">Detector</Link> : null}
            </nav>
            <div className="who">
              <div className="who-text">
                <span className="who-email">{user.email}</span>
                <span className="muted small">{orgLabel || "No org"}</span>
              </div>
              <form action={signOut}>
                <button type="submit" className="btn btn-ghost">
                  Sign out
                </button>
              </form>
            </div>
          </header>
        ) : null}
        <div className={user ? "app-main" : ""}>{children}</div>
      </body>
    </html>
  );
}
