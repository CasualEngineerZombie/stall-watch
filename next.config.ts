import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Stop Turbopack from walking up to a lockfile outside this repository.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
