import type { Metadata, Viewport } from "next";
import { Cinzel, Montserrat, Raleway } from "next/font/google";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { signOut } from "@/app/auth/actions";
import { BrandLockup } from "@/components/brand-lockup";
import { NavLinks } from "@/components/nav-links";
import "./globals.css";

const heading = Raleway({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-heading",
  display: "swap",
});

const body = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const display = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Stall Watch — Reverie3D",
    template: "%s · Stall Watch",
  },
  description:
    "Finish selection oversight for Reverie3D builders. See every project, and know the moment one goes quiet.",
};

export const viewport: Viewport = {
  themeColor: "#f7f5f3",
  colorScheme: "light",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, orgLabel, isStaff } = await getSession();

  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable} ${display.variable}`}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {user ? (
          <header className="site-header">
            <div className="header-inner">
              <BrandLockup href="/projects" />
              <NavLinks isStaff={isStaff} />
              <div className="header-account">
                <div className="account-meta">
                  <span className="account-org">{orgLabel || "No organisation"}</span>
                  <span className="account-email">{user.email}</span>
                </div>
                <form action={signOut}>
                  <button type="submit" className="btn btn-small btn-outline">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </header>
        ) : null}

        <div
          id="main-content"
          className={user ? "app-main" : undefined}
          tabIndex={-1}
        >
          {children}
        </div>

        {user ? (
          <footer className="site-footer">
            <div className="footer-inner">
              <span className="footer-brand">Stall Watch</span>
              <span className="footer-copy">
                Finish selection oversight · Reverie3D
              </span>
              <span className="footer-meta">Daily detector · 02:00 UTC</span>
            </div>
          </footer>
        ) : null}
      </body>
    </html>
  );
}
