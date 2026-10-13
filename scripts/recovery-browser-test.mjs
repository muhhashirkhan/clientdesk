// Local recovery test using a disposable testing account; no emails are sent.
import {assertTestTarget} from "./test-target.mjs";
assertTestTarget();
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = process.env.CLIENTDESK_PREVIEW_URL || "http://localhost:3013";
if (!["localhost","127.0.0.1"].includes(new URL(base).hostname)) throw Error("Recovery browser test is local only.");
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = ({ data, error }) => { if (error) throw error; return data; };
let browser;
let userId;
try {
  browser = await chromium.launch();
  const email = "clientdesk-recovery-" + randomUUID() + "@example.test";
  const oldPassword = randomBytes(24).toString("base64url");
  const newPassword = randomBytes(24).toString("base64url");
  userId = must(await service.auth.admin.createUser({ email, password: oldPassword,
    email_confirm: true, user_metadata: { full_name: "Disposable recovery test" } })).user.id;
  const recovery = must(await service.auth.admin.generateLink({ type: "recovery", email,
    options: { redirectTo: base + "/auth/callback?next=%2Freset-password" } }));
  const callback = base + "/auth/callback?next=%2Freset-password&type=recovery&token_hash=" +
    encodeURIComponent(recovery.properties.hashed_token);
  const context = await browser.newContext();
  const reset = await context.newPage();
  reset.setDefaultTimeout(30000);
  await reset.goto(callback);
  await reset.waitForURL("**/reset-password");
  await reset.getByLabel("New password", { exact: true }).fill(newPassword);
  await reset.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await reset.getByRole("button", { name: "Update password", exact: true }).click();
  await reset.waitForURL("**/dashboard");
  await reset.goto(base + "/settings");
  await reset.locator(".settings-signout").getByRole("button", { name: "Sign out", exact: true }).click();
  await reset.waitForURL("**/login");
  await reset.getByLabel("Email address", { exact: true }).fill(email);
  await reset.getByLabel("Password", { exact: true }).fill(newPassword);
  await reset.getByRole("button", { name: "Sign in", exact: true }).click();
  await reset.waitForURL("**/dashboard");
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  assert((await auth.auth.signInWithPassword({ email, password: oldPassword })).error);
  const replayContext = await browser.newContext();
  const replay = await replayContext.newPage();
  replay.setDefaultTimeout(30000);
  await replay.goto(callback);
  await replay.getByRole("heading", { name: "Link unavailable", exact: true }).waitFor();
  assert.equal(await replay.getByLabel("New password", { exact: true }).count(), 0);
  await writeFile("test-results/recovery-browser-report.json", JSON.stringify({
    date: new Date().toISOString(), origin: base,
    checks: ["fresh-browser recovery token",
      "saved new password", "sign-out and new-password browser login",
      "old password rejected", "used link rejected"], ownedPasswordChanged: false,
    deliveryVerifiedSeparately: false, emailSent: false
  }, null, 2));
  console.log("PASS: local recovery callback, saved password, browser re-login, old-password denial and used-link rejection. Owned password unchanged.");
} finally {
  await browser?.close();
  if (userId) must(await service.auth.admin.deleteUser(userId));
}
