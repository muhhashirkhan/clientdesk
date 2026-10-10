import Link from "next/link";
import { serverClient, configured } from "@/lib/supabase/server";
import { Form, Field, Hidden } from "@/components/forms";
import { acceptInvitation } from "@/app/actions";
import { uuid } from "@/lib/validation";
export default async function Accept({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const { invitation } = await searchParams;
  if (!configured() || !uuid.safeParse(invitation).success)
    return (
      <>
        <h1 className="auth-title">Invitation unavailable.</h1>
        <p>Please use the complete link from your invitation email.</p>
        <Link href="/login" className="button primary">
          Go to sign in
        </Link>
      </>
    );
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return (
      <>
        <h1 className="auth-title">You’re invited.</h1>
        <p>
          Open the secure link in your invitation email, or sign in with the
          invited email address.
        </p>
        <Link
          className="button primary"
          href={
            "/login?next=" +
            encodeURIComponent("/accept-invitation?invitation=" + invitation)
          }
        >
          Sign in to continue
        </Link>
      </>
    );
  const row = await db
    .from("invitations")
    .select("*")
    .eq("id", invitation!)
    .maybeSingle();
  if (
    row.error ||
    !row.data ||
    row.data.revoked_at ||
    new Date(row.data.expires_at) < new Date()
  )
    return (
      <>
        <h1 className="auth-title">
          This invitation
          <br />
          is unavailable.
        </h1>
        <p>
          It may have expired or been sent to a different email. Ask Aiquor for
          a new invitation.
        </p>
        <Link href="/dashboard">Back to your workspace</Link>
      </>
    );
  return (
    <>
      <p className="eyebrow">YOUR INVITATION TO AIQUOR</p>
      <h1 className="auth-title">
        Welcome to
        <br />
        your workspace.
      </h1>
      <p className="muted">Set up your account for {user.email}.</p>
      <Form action={acceptInvitation} submit="Accept invitation">
        <Hidden name="invitation" value={invitation!} />
        <Field label="Full name" name="full_name" maxLength={120} />
        <Field
          label="Set a password"
          name="password"
          type="password"
          help="Use at least 12 characters."
        />
        <Field label="Confirm password" name="confirm" type="password" />
      </Form>
    </>
  );
}
