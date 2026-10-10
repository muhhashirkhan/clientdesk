# Release gate

Do not mark the portal finished until these steps pass on the deployed origin. Use only the two approved owned inboxes. Use a third disposable account for isolation; never invite an unrelated person for a test.

- [x] Supabase migration applied, auth redirects configured, custom SMTP sender verified.
- [x] Admin `hello@getaiquor.com` receives setup email, sets password, signs in.
- [x] Fresh database shows no invented clients, projects, revenue or notifications.
- [x] Admin adds client `imeanhashir88@gmail.com`, creates a scoped project with deadline, then sends invitation.
- [ ] Client receives email, accepts invitation and chooses password in a separate browser session.
- [x] Client sees only the assigned project and cannot access admin Clients/New project routes.
- [x] Client uploads a real file, refreshes, and downloads identical contents.
- [ ] Admin adds milestone, submits notes and preview link. Client receives in-app review notification.
- [x] Client requests a change. Admin sees feedback and submits a new revision.
- [x] Client approves. Both decisions preserve name and timestamp; duplicate decisions fail.
- [x] Both accounts post a comment and reply. Refresh and sign out/in preserve discussions, file and approval state.
- [x] A third client cannot read project URL, comments, files, decisions or obtain a signed file URL through direct API calls.
- [x] Remove test client's membership: new project/file requests fail and an old invitation cannot regrant access.
- [ ] Restore via a new invitation; archive project and verify writes are blocked, restore and verify writes resume.
- [x] Edit business settings and confirm saved values (profile refresh verification remains open).
- [ ] Request password reset to owned inbox, open email, set new password, sign out and log in with new password; invalid/reused link shows an error.
- [ ] Invalid upload, expired link, permission failure and disconnected network never display false success.
- [ ] Desktop/mobile, keyboard focus, reduced motion and no-WebGL fallback checked.

Local PostgreSQL tests cover much of the policy logic, but the boxes above require real browser/Auth/Storage/email evidence. Record the deployment URL, date and test outcomes here once performed.

## Live evidence — October 8, 2026

Deployment: https://aiquor-clientdesk.vercel.app. Both migrations are installed and default-provider invitation/sign-in emails reached the approved owned inboxes. The owner chose both passwords. Client membership was verified and completed through the owned client’s authenticated invitation RPC after the owner reported setup; the UI acceptance action still needs an isolated end-to-end check.

Hosted API tests passed, including real file content, signed-download isolation, decisions, comments, password re-login and membership revocation/replay denial. Owned-account browser checks passed through project/file isolation and saved approval history; the final business settings and 15 fully loaded viewport checks passed with no browser errors. See ignored test-results reports for actual completion evidence. Resend SMTP and custom templates are now installed. A real branded recovery email reached the owned Gmail inbox. Fresh-browser recovery, password update and new-password login plus used-link denial passed on a disposable account; the owner’s passwords were unchanged. The exact owned-email reset/change step remains unchecked to keep the owner’s password private.
