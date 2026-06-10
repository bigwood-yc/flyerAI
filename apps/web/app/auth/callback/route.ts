import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("onboarding_done")
          .eq("id", user.id)
          .single();

        const next = profile?.onboarding_done ? "/" : "/onboarding";
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Auth failed — redirect back to login with error hint
  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
