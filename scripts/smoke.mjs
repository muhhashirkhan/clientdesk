import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const origin = process.env.CLIENTDESK_PREVIEW_URL || "http://127.0.0.1:3012";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw Error("This unconfigured-state smoke check is local only.");
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 950 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const path of [
      "/login",
      "/forgot-password",
      "/accept-invitation?invitation=invalid",
      "/auth/callback",
    ]) {
      await page.goto(origin + path);
      await page.locator("main").waitFor();
      if (path === "/auth/callback")
        await page.getByRole("heading", { name: "Link unavailable" }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${path} overflows at ${width}`,
      );
    }
    await page.goto(origin + "/dashboard");
    await page.waitForURL("**/login");
    assert(await page.getByRole("button", { name: "Sign in" }).isDisabled());
    await page.screenshot({
      path: `test-results/login-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await page.close();
  }
  const animated = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await animated.goto(origin + "/login");
  await animated.locator('.liquid-logo[data-ready="true"]').waitFor();
  await animated.locator('.liquid-glass[data-ready="true"]').waitFor();
  await animated.screenshot({
    path: "test-results/login-effects.png",
    fullPage: true,
  });
  await animated.close();
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...args);
    };
  });
  await fallback.goto(origin + "/login");
  await fallback
    .getByRole("heading", { name: "Make room for your best work." })
    .waitFor();
  assert(await fallback.locator(".liquid-logo-fallback").isVisible());
  await fallback.close();
  console.log(
    "PASS: 12 responsive auth-page checks, protected-route redirects, honest setup state, live glass/logo shaders and no-WebGL fallback. Authenticated screens still require hosted acceptance.",
  );
} finally {
  await browser.close();
}
