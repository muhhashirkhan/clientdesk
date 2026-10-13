"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/utils";
export default function Callback() {
  const [error, setError] = useState("");
  const started = useRef(false);
  const router = useRouter();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function finish() {
      const params = new URLSearchParams(location.search),
        hash = new URLSearchParams(location.hash.slice(1));
      const next = safeNext(params.get("next"));
      if (hash.get("error") || params.get("error")) {
        setError(
          "This sign-in link has expired or is invalid. Please request a new one.",
        );
        return;
      }
      if (!params.get("token_hash") && !params.get("code") &&
          !(hash.get("access_token") && hash.get("refresh_token"))) {
        setError("This link is incomplete. Please use the link in your latest email.");
        return;
      }
      const db = browserClient();
      let failure: Error | null = null;
      const type = params.get("type");
      if (
        params.get("token_hash") &&
        (type === "invite" ||
          type === "recovery" ||
          type === "magiclink" ||
          type === "email")
      ) {
        const result = await db.auth.verifyOtp({
          token_hash: params.get("token_hash")!,
          type,
        });
        failure = result.error;
        history.replaceState(
          null,
          "",
          location.pathname + "?next=" + encodeURIComponent(next),
        );
      } else if (params.get("code")) {
        const result = await db.auth.exchangeCodeForSession(
          params.get("code")!,
        );
        failure = result.error;
      } else if (hash.get("access_token") && hash.get("refresh_token")) {
        const result = await db.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        });
        failure = result.error;
        history.replaceState(null, "", location.pathname + location.search);
      } else {
        setError(
          "This link is incomplete. Please use the link in your latest email.",
        );
        return;
      }
      if (failure) {
        setError(
          "This link could not be verified. Request a fresh link and try again.",
        );
        return;
      }
      router.replace(next);
      router.refresh();
    }
    finish().catch(() =>
      setError("Could not verify your link. Please try again."),
    );
  }, [router]);
  return (
    <main className="standalone">
      <h1>{error ? "Link unavailable" : "Securing your session…"}</h1>
      <p role={error ? "alert" : "status"}>
        {error || "You’ll be taken to your workspace shortly."}
      </p>
      {error && (
        <Link href="/login" className="button primary">
          Return to sign in
        </Link>
      )}
    </main>
  );
}
