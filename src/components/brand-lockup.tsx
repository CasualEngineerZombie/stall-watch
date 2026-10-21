import Link from "next/link";

type Tone = "dark" | "light";

/**
 * The product wordmark, not the Reverie3D logo. The Threshold mark is a pair of
 * offset planes: one dark, one stone, with opposing cut corners. It reads as a
 * pause at small sizes and as a door held ajar at large ones. The reference only
 * supplies the restraint, palette and tracked-serif rhythm.
 */
export function BrandLockup({
  tone = "dark",
  href,
}: {
  tone?: Tone;
  href?: string;
}) {
  const content = (
    <>
      <svg
        className="brand-mark"
        viewBox="13 10 38 44"
        aria-hidden="true"
        focusable="false"
      >
        <path
          className="brand-mark-plane brand-mark-plane--base"
          d="M13 10H20L27 17V50H13Z"
        />
        <path
          className="brand-mark-plane brand-mark-plane--accent"
          d="M37 14H51V54H44L37 47Z"
        />
      </svg>
      <span className="brand-copy">
        <span className="brand-wordmark">Stall Watch</span>
        <span className="brand-byline">by Reverie3D</span>
      </span>
    </>
  );

  const className = `brand-lockup brand-lockup--${tone}`;

  if (href) {
    return (
      <Link href={href} className={className} aria-label="Stall Watch — Projects">
        {content}
      </Link>
    );
  }

  return <span className={className}>{content}</span>;
}
