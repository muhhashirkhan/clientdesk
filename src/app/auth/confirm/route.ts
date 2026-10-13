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
    const { data, error } = await db.auth.verifyOtp({ token_hash, type });
    if (!error) {
      const target = new URL(next, url.origin);
      const dest =
        target.origin === url.origin ? target : new URL("/dashboard", url.origin);
      const response = NextResponse.redirect(dest);
      if (process.env.CLIENTDESK_LOCAL_PG === "true" && data?.user) {
        response.cookies.set(
          "cd-local-session",
          JSON.stringify({ id: data.user.id, email: data.user.email }),
          { path: "/", sameSite: "lax" },
        );
      }
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
  const fallback = NextResponse.redirect(
    new URL("/login?error=This+email+link+is+invalid+or+expired.", url.origin),
  );
  fallback.headers.set("Cache-Control", "private, no-store");
  return fallback;
}
