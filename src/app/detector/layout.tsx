import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { NoAccess } from "@/components/no-access";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Gate the detector before its loading boundary renders. If a builder could
 * reach the page loader first, Next.js would have already sent a 200 and the
 * 404 would become a soft 404. The page repeats these checks as defence in
 * depth; this layout exists so the HTTP status is honest.
 */
export default async function DetectorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { memberships, isStaff } = await getSession();

  if (!memberships.length) {
    return <NoAccess />;
  }

  if (!isStaff) {
    notFound();
  }

  return children;
}
