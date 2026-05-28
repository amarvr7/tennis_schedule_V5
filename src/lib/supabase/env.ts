type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

/**
 * Reads and validates the public Supabase env vars used by both the browser
 * and server clients. Throws early (at call time) with an actionable message
 * instead of letting `createClient` fail with an opaque error.
 */
export const getPublicSupabaseEnv = (): SupabaseEnv => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).",
    );
  }

  return { url, publishableKey };
};
