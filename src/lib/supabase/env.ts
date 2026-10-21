/**
 * The only credentials this app knows about: the public anon key and project URL.
 *
 * There is deliberately no service-role key in the app, the example env file or the
 * deployment. Every request runs as the signed-in user, so RLS is the boundary.
 *
 * Read lazily (inside a function) so `next build` can type-check and compile without a
 * live project; a missing value becomes a clear runtime error instead of a vague
 * "fetch failed".
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local for local development, or set both in Vercel.",
    );
  }

  return { url, anonKey };
}
