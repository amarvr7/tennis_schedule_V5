import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseEnv } from "./env";

/**
 * Supabase client for Client Components ("use client").
 * Reads/writes the session from browser cookies via @supabase/ssr.
 */
export const createClient = () => {
  const { url, publishableKey } = getPublicSupabaseEnv();
  return createBrowserClient(url, publishableKey);
};
