"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();

  const links = [
    { href: "/projects", label: "Projects" },
    { href: "/alerts", label: "Alerts" },
    ...(isStaff ? [{ href: "/detector", label: "Detector" }] : []),
  ];

  return (
    <nav className="site-nav" aria-label="Main">
      {links.map((link) => {
        const active =
          link.href === "/projects"
            ? pathname === "/projects" || pathname.startsWith("/projects/")
            : pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? "nav-link is-active" : "nav-link"}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
