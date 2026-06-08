import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Exchanges the PKCE auth code from Supabase email links (password reset,
 * email confirmation, magic link) for a live session and redirects to `next`.
 */
export const GET = async (request: Request) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=reset_link_invalid`);
};
