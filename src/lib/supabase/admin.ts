import "server-only";
import { createClient } from "@supabase/supabase-js";
export function adminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Invitation delivery is not configured yet.");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function appUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("The portal address is not configured yet.");
  return url.replace(/\/$/, "");
}
