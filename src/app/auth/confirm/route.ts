import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";
export async function GET(request: NextRequest) {
  const url = new URL(request.url),
    token_hash = url.searchParams.get("token_hash"),
    type = url.searchParams.get("type");
  const next = safeNext(url.searchParams.get("next"));
  if (
    token_hash &&
    (type === "invite" ||
      type === "recovery" ||
      type === "email" ||
      type === "magiclink")
  ) {
    const db = await serverClient();
    const { error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(
    new URL("/login?error=This+email+link+is+invalid+or+expired.", url.origin),
  );
}
