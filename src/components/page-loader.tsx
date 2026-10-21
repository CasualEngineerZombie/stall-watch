import { BrandLockup } from "@/components/brand-lockup";

/**
 * The route-level fallback. It is deliberately quiet: the mark, a hairline sweep
 * and a status line are enough to say the ledger is opening.
 */
export function PageLoader() {
  return (
    <main className="route-loader" aria-busy="true">
      <div className="route-loader-inner">
        <div className="route-loader-brand" aria-hidden="true">
          <BrandLockup />
        </div>
        <div className="route-loader-track" aria-hidden="true">
          <span />
        </div>
        <p className="route-loader-label" role="status">
          Loading
        </p>
      </div>
    </main>
  );
}
