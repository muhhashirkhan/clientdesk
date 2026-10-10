import Link from "next/link";
import { Form, Hidden } from "@/components/forms";
import { signIn } from "@/app/actions";
import { configured } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const ready = configured();
  return (
    <>
      <p className="eyebrow">WELCOME BACK</p>
      <h2 className="auth-title">
        Make room for
        <br />
        your best work.
      </h2>
      <p className="muted">Sign in to your ClientDesk workspace.</p>
      {!ready && (
        <div className="notice">
          Aiquor’s portal is being set up. Sign-in will be available once setup
          is complete.
        </div>
      )}
      {params.error && (
        <p role="alert" className="form-message error">
          {params.error}
        </p>
      )}
      <Form action={signIn} submit="Sign in" disabled={!ready}>
        <Hidden name="next" value={params.next || "/dashboard"} />
        <label className="field">
          Email address
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
          />
        </label>
        <Link href="/forgot-password" className="forgot-link">
          Forgot password?
        </Link>
      </Form>
      <p className="auth-bottom">
        New to ClientDesk?{" "}
        <span>Use the invitation from Aiquor to set up your account.</span>
      </p>
    </>
  );
}
