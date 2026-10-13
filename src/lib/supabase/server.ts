import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createLocalSupabaseClient } from "./local-pg";

export function isLocalPg() {
  return process.env.CLIENTDESK_LOCAL_PG === "true";
}

export function configured() {
  return (
    isLocalPg() ||
    (!!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

export async function serverClient() {
  if (!configured())
    throw new Error(
      "The portal is still being configured. Please try again later.",
    );
  const jar = await cookies();
  if (isLocalPg()) {
    return createLocalSupabaseClient({
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options as Record<string, unknown>),
          );
        } catch {
          /* Server components cannot write cookies. */
        }
      },
    }) as unknown as ReturnType<typeof createServerClient>;
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Server components cannot write cookies. The proxy refreshes them. */
          }
        },
      },
    },
  );
}
