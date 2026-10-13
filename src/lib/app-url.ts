type UrlEnvironment = {
  VERCEL_ENV?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
};

// Use Vercel-provided domains, never a request Host header, for emailed links.
export function resolveAppUrl(env: UrlEnvironment): string {
  const preview = env.VERCEL_ENV === "preview";
  const deployed = preview || env.VERCEL_ENV === "production";
  const domain = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
  const raw = preview
    ? domain && `https://${domain}`
    : env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_SITE_URL;
  if (!raw) throw new Error("The portal address is not configured yet.");
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("The portal address must be a valid origin.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/" ||
    (deployed && (url.protocol !== "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  ) throw new Error("The portal address must be a valid HTTPS origin when deployed.");
  return url.origin;
}
