import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAppUrl } from "../src/lib/app-url.ts";

test("email origins follow local, Preview and Production environments", () => {
  assert.equal(resolveAppUrl({NEXT_PUBLIC_APP_URL: "http://localhost:3012/"}), "http://localhost:3012");
  assert.equal(resolveAppUrl({VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "clientdesk-git-test.vercel.app", VERCEL_URL: "clientdesk-hash.vercel.app", NEXT_PUBLIC_APP_URL: "http://localhost:3012"}), "https://clientdesk-git-test.vercel.app");
  assert.equal(resolveAppUrl({VERCEL_ENV: "preview", VERCEL_URL: "clientdesk-hash.vercel.app", NEXT_PUBLIC_APP_URL: "https://production.example"}), "https://clientdesk-hash.vercel.app");
  assert.equal(resolveAppUrl({VERCEL_ENV: "production", VERCEL_URL: "clientdesk-hash.vercel.app", NEXT_PUBLIC_APP_URL: "https://aiquor-clientdesk.vercel.app"}), "https://aiquor-clientdesk.vercel.app");
  assert.equal(resolveAppUrl({NEXT_PUBLIC_SITE_URL: "https://portal.example"}), "https://portal.example");
});
test("unsafe or missing email origins fail before sending", () => {
  for (const env of [
    {}, {VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://production.example"},
    {VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "http://localhost:3012"},
    {VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://localhost:3012"},
    {NEXT_PUBLIC_APP_URL: "https://user:password@portal.example"},
    {NEXT_PUBLIC_APP_URL: "javascript:alert(1)"},
    {NEXT_PUBLIC_APP_URL: "https://portal.example/path"},
    {NEXT_PUBLIC_APP_URL: "https://portal.example?next=evil"},
    {NEXT_PUBLIC_APP_URL: "https://portal.example#fragment"},
    {VERCEL_ENV: "preview", VERCEL_URL: "evil.example/path"},
  ]) assert.throws(() => resolveAppUrl(env));
});
