"use client";

import { useLinkStatus } from "next/link";

/**
 * A fixed-size inline hint for client-side navigation. It reserves its own space
 * so the route loader or late RSC response does not shift the link text.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();

  return (
    <span
      className={pending ? "link-pending is-pending" : "link-pending"}
      aria-hidden="true"
    />
  );
}
