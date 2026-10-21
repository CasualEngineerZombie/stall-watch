"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
};

/**
 * A server-action submit button that shows the action is still running. The
 * label changes as well as the spinner, so the state is not colour-only.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={pending ? `${className} is-pending` : className}
      disabled={pending}
      aria-busy={pending}
    >
      <span className="btn-label">{pending ? pendingLabel : children}</span>
      {pending ? <span className="btn-spinner" aria-hidden="true" /> : null}
    </button>
  );
}
