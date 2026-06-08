import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv } from "./env";

/**
 * Service-role Supabase client for trusted server jobs (cron, webhooks).
 * Bypasses RLS — never expose to the browser or client components.
 */
export const createServiceClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for service jobs. See .env.example.",
    );
  }

  const { url } = getPublicSupabaseEnv();
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
