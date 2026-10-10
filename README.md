# ClientDesk for Aiquor

Next.js 16, TypeScript, Tailwind 4 and Supabase. One Aiquor business workspace, with an admin role and client memberships. Production has no seed customers or invented metrics.

## Live demo

[Open ClientDesk](https://aiquor-clientdesk.vercel.app/dashboard). The portal requires an invited account.

ClientDesk helps agencies manage clients, projects, milestones, files, discussions, approvals and notifications in a shared workspace.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Missing Supabase configuration displays a setup notice and disables login. It does not simulate accounts or successful saves.

## Configure Supabase

1. Create a dedicated Supabase project. Apply both files in `supabase/migrations/` in date order through the SQL editor or Supabase CLI migrations. They create tables, row permissions, workflow functions and the private `project-files` bucket. The second migration fixes the admin policy for creating projects with returned rows. Do not reapply the initial migration to an existing configured project.
2. In `.env.local`, set the project URL, publishable key and server-only service role key. Never prefix the service key with `NEXT_PUBLIC_`, paste it into chat, or commit it. The application uses it only for invitations; ordinary reads and writes use the signed-in user's session and RLS.
3. Set `NEXT_PUBLIC_APP_URL` to the portal origin. In Supabase Auth, use that origin as Site URL and allow `<origin>/auth/callback**` and `<origin>/auth/confirm**` in Redirect URLs. Add localhost separately for development. Use explicit production origins.
4. Disable public sign-ups; admin invitations create users. Set a minimum password length of 12, retain email verification, and configure email rate limits. This portal has no public registration page.
5. Configure custom SMTP and verify its sender domain. Supabase's default email service is restricted to organization team addresses, is rate limited and is not production email delivery. A forwarding inbox alone is not an SMTP sender. Official instructions: https://supabase.com/docs/guides/auth/auth-smtp . Test invitation, magic-link and reset emails using your own test accounts.
6. The included templates in `supabase/templates/` use `RedirectTo`, a one-use `token_hash`, and the appropriate verification `type`. The app supplies a callback URL containing the safe relative `next` destination. `/auth/callback` supports these links across browsers, and also supports standard PKCE/implicit links. If reverting to standard PKCE recovery emails, open those links in the browser that requested them.
7. Set `CLIENTDESK_ADMIN_EMAIL=admin@example.com`, then `npm run bootstrap:admin`. It requests an invitation when needed, grants the admin role server-side, and never creates or logs a password. Open the setup email and choose your own password. If that email expires, use Forgot password. Never allow users to choose their own role.
8. Sign in, configure business settings, and verify the client invitation, project, file upload, approval and recovery workflows using test accounts before onboarding customers.

Deploy to any Next.js Node hosting provider, set the same environment variables there, update the Supabase redirect allowlist, and repeat the acceptance workflow at the final URL. Static GitHub Pages cannot run this application's server actions.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
# With the unconfigured local app running at port 3012:
npm run test:smoke
```

The policy suite applies the actual migration to PGlite PostgreSQL. Minimal Auth/Storage schema scaffolding lets PostgreSQL evaluate permissions, triggers and functions. It covers invitations, private-object access, real state transitions, audit immutability, membership revocation and cross-client denial. It is not a substitute for hosted Supabase Auth or Storage API tests.

For real API verification, configure a **separate disposable Supabase test project**, apply the migration, and set `CLIENTDESK_TEST_PROJECT=true`. Then run `npm run test:integration`. It creates three temporary accounts with random in-memory passwords, uploads a real file, tests change requests and approval, signs back in, verifies isolation, and cleans up only the created test records. It does not send emails or verify the browser. Never point this script at production.

## Security and data behavior

- Every public table has RLS; private file paths are project/user/random-ID based. File metadata is finalized only after the database verifies the stored object.
- Invitation acceptance checks the verified account email, expiration and revocation. Replaying an accepted invitation cannot restore revoked access.
- Review submission and client decisions are transactional database functions. Names and timestamps are stored as immutable audit records. Clients cannot directly change milestone status.
- File downloads use 60-second signed URLs after an authorized metadata lookup. Revocation blocks new requests; an already-issued signed URL can last until its short expiry.
- Archived and completed projects are read-only for files, comments and review decisions. Admins can restore or reopen them.
- A storage upload and metadata insert span separate services: failed metadata finalization attempts cleanup and reports failures. File deletion removes storage first and metadata second; either error is surfaced.
- Notifications are persisted in-app and refresh on page navigation, saved actions, or the refresh button. There is no claim of push or email notifications for project activity.
- Large deployments should add pagination to discussion/history and avoid the default Supabase query row cap before exceeding 1,000 records per project.

## Design sources

User-selected references are actually integrated, not only mentioned:

- [React Three Fiber](https://github.com/pmndrs/react-three-fiber) and [ShaderGradient](https://github.com/ruucm/shadergradient): animated lavender, peach and mint backdrops on authentication pages and throughout the authenticated workspace. Workspace colours fade into the page beneath readable forms and file cards.
- [Liquid Glass JS](https://github.com/dashersw/liquid-glass-js): adapted refraction shader on the authentication card and shared glass surfaces on native action buttons throughout the portal. Original button/container/CSS source and the MIT license are retained in `vendor/liquid-glass-js/`. Translucent backdrops, pill edges and highlights preserve keyboard focus and a no-WebGL fallback. The shader samples a decorative generated texture.
- [Liquid Logo](https://github.com/collidingScopes/liquid-logo): liquid metal treatment of the custom Aiquor a-dot monogram. Static symbol, metallic SVG/PNG and ClientDesk lockup exports are in `public/brand/`; the same mark is used in navigation and the favicon.

Vendored shader licenses are in `public/licenses`. Decorative effects have static fallbacks, honor reduced motion and do not control forms or project access. Work pages prioritize readable project information.

Dependency audit: no production vulnerabilities were reported during local verification. The development-only Next ESLint toolchain currently inherits the braces advisory GHSA-vfj7-8cjw-p6xm; npm proposes an incompatible Next 14 downgrade, so no forced downgrade was applied. Recheck for a patched upstream release.
