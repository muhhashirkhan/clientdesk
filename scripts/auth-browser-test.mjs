import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const email = "clientdesk-login-" + randomUUID() + "@example.test",
  password = randomBytes(24).toString("base64url");
const user = must(
  await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Disposable browser login test" },
  }),
).user;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(25000);
  const login = async () => {
    await page.goto("http://localhost:3012/login");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
  };
  await login();
  await page.getByText("Your workspace is ready.", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Your workspace is ready.", { exact: true }).waitFor();
  await page.goto("http://localhost:3012/settings");
  await page
    .locator(".settings-signout")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await page.waitForURL("**/login");
  await login();
  assert.equal(
    await page.getByRole("link", { name: "Clients", exact: true }).count(),
    0,
  );
  await page.goto("http://localhost:3012/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("intentionally-wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert(page.url().endsWith("/login"));
  console.log(
    "PASS: real browser password login, session persistence, sign-out/re-login, client-only navigation and invalid-password error.",
  );
} finally {
  await browser.close();
  must(await service.auth.admin.deleteUser(user.id));
}
