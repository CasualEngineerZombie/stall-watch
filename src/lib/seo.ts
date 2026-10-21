import type { Metadata } from "next";

/**
 * One place for the public identity. The app is sign-in only, so the public face
 * is deliberately small: the login page, its canonical URL, and one share card.
 */
export const SITE_NAME = "Stall Watch";
export const SITE_TITLE =
  "Stall Watch — Finish selection oversight for Reverie3D";
export const SITE_DESCRIPTION =
  "Finish selection oversight for Reverie3D builders and staff. See every project, every finish, and know when a selection has gone quiet for five days.";

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function resolveSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return withProtocol(configured).replace(/\/+$/, "");

  // Vercel supplies this at build time, so a normal deploy gets a stable canonical
  // origin without another dashboard variable. Set NEXT_PUBLIC_SITE_URL only when
  // the public custom domain differs from the production deployment URL.
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) {
    return withProtocol(vercelProduction).replace(/\/+$/, "");
  }

  const vercelPreview = process.env.VERCEL_URL?.trim();
  if (vercelPreview) return withProtocol(vercelPreview).replace(/\/+$/, "");

  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

export const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Stall Watch by Reverie3D — The quiet ones, brought to light.",
} as const;

export const OPEN_GRAPH = {
  type: "website",
  locale: "en_US",
  url: "/login",
  siteName: SITE_NAME,
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  images: [OG_IMAGE],
} satisfies NonNullable<Metadata["openGraph"]>;

export const TWITTER = {
  card: "summary_large_image",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  images: [OG_IMAGE.url],
} satisfies NonNullable<Metadata["twitter"]>;

export const NO_INDEX = {
  index: false,
  follow: false,
  nocache: true,
} satisfies NonNullable<Metadata["robots"]>;
