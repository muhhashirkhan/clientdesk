# ClientDesk status — October 8, 2026

Live portal: https://aiquor-clientdesk.vercel.app

Supabase project ycysxbipmjraofdhtzwj is configured with both database migrations, row permissions and private storage. The official Supabase CLI and Vercel deployment are authenticated. Production environment variables are configured privately. Login is real and enabled.

The two owner-controlled accounts are confirmed and have passwords chosen by the owner: hello@getaiquor.com (admin) and imeanhashir88@gmail.com (client). Invitation and sign-in emails reached the owned inboxes. The client invitation is accepted and project membership is saved. No owned passwords were read or changed by the agent.

Verified:
- 22 PostgreSQL policy/validation tests, TypeScript, ESLint and production deployment passed.
- Hosted Auth/Storage API workflow passed: real upload/download, discussions, change requests, revised approval, password sign-out/relogin persistence, client isolation and revoked-membership/invitation replay denial. Disposable fixtures were cleaned up.
- Browser login/password error/sign-out/relogin passed using a disposable account.
- Admin created an explicitly labelled acceptance-test client/project through the browser; invitation delivery was verified in the owned inbox.
- Owned-account browser workflow has exercised upload/download, comments/replies, milestone submission, change request and revision approval with saved actor/time, reload and responsive layouts. Final isolation/settings checks passed, with no browser errors. Evidence: test-results/owned-acceptance-report.json; loaded mobile/desktop screenshots were inspected.
- All four requested design libraries/shaders are integrated; license notices retained. Reduced-motion and no-WebGL fallbacks were checked.

Email sender verified:
- Resend SMTP is configured with smtp.resend.com:465 and sender Aiquor ClientDesk <hello@getaiquor.com>. The owner verified getaiquor.com and saved the key privately. Custom invitation, sign-in, confirmation and recovery templates were successfully applied.
- A password-reset request through the hosted form delivered a real email to imeanhashir88@gmail.com from the branded sender. The email points to the hosted callback with a recovery token; its secret link was not printed or consumed.
- Fresh-browser recovery, password update, sign-out/new-password login, old-password rejection and used-link rejection passed on a disposable account. The account was removed. Evidence: test-results/recovery-browser-report.json. No owned password was changed.

Remaining release work:
- Finish the remaining release-gate checks in ACCEPTANCE.md, including isolated invitation acceptance, notifications and archive/restore browser checks. The owned-mail recovery link remains available for the owner; full recovery was tested separately on the disposable account.

There are no invented customers or business metrics. The owner acceptance project and its clearly labelled test uploads/milestones are real saved test records, not client work. Temporary API/browser test accounts are removed after checks. Secret values remain in ignored environment files and deployment configuration.

## Visible workspace ShaderGradient update

Added the actual ShaderGradient renderer to the persistent authenticated workspace layout, using lavender, peach and mint colours that fade beneath the page. Authentication uses the same palette with a dark overlay for readable text. No project data or authentication logic changed. TypeScript and lint passed; browser checks confirmed a rendered workspace canvas, desktop/mobile layouts without overflow or page errors, reduced-motion canvas removal, and usable login fields without WebGL. Desktop/mobile/login screenshots were inspected.

## Liquid glass action buttons

Retained original MIT-licensed button.js, container.js and glass.css in vendor/liquid-glass-js. Native portal/authentication action buttons now use the upstream refraction shader through a shared decorative texture plus translucent backdrops, rounded edges, rim highlights and explicit keyboard focus. No per-button WebGL contexts or document capture. Downloads, required-upload validation, desktop/mobile overflow, browser errors, keyboard focus and no-WebGL fallback passed. Inspected screenshots; adjusted sidebar Sign out contrast. TypeScript, ESLint and the production build passed.

## Aiquor a-dot logo

Created a custom scalable a-dot monogram, metallic static version and ClientDesk wordmark export under public/brand/. The app uses the same geometry in its navigation and favicon; the authentication card uses the collidingScopes/liquid-logo shader with this SVG mask instead of the former triangle. Exported a transparent 1024px PNG. Logo browser rendering, reduced-motion rendering, TypeScript and lint passed with no browser page errors; static and animated previews were inspected. The original shader MIT notice remains in public/licenses/liquid-logo.txt.
