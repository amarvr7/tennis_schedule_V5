/**
 * Detect whether Phase A tournament migration columns exist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const isMissingColumnError = (message: string): boolean =>
  message.includes("does not exist") || message.includes("column");

/** True when program_id / status / published_at columns are available. */
export const hasPhaseASchema = async (supabase: SupabaseClient): Promise<boolean> => {
  const { error } = await supabase.from("tournaments").select("program_id").limit(1);
  if (!error) return true;
  return !isMissingColumnError(error.message);
};
