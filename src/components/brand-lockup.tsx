import Link from "next/link";

type Tone = "dark" | "light";

/**
 * The product wordmark, not the Reverie3D logo. The mark is two paused strokes:
 * a small visual pun on a stalled selection, drawn from the same taupe/near-black
 * palette as the rest of the system.
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
      <span className={`brand-mark brand-mark--${tone}`} aria-hidden="true">
        <span />
        <span />
      </span>
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
