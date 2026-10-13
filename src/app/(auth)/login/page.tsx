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
    <div className="auth-login-flow">
      <div className="auth-stagger-1">
        <p className="eyebrow">WELCOME BACK</p>
        <h2 className="auth-title">
          Make room for
          <br />
          your best work.
        </h2>
        <p className="muted auth-subtitle">
          Sign in to your ClientDesk workspace.
        </p>
      </div>

      {!ready && (
        <div className="notice auth-stagger-2">
          Aiquor’s portal is being set up. Sign-in will be available once setup
          is complete.
        </div>
      )}

      {params.error && (
        <p role="alert" className="form-message error auth-stagger-2">
          {params.error}
        </p>
      )}

      <div className="auth-stagger-3">
        <Form action={signIn} submit="Sign in" disabled={!ready}>
          <Hidden name="next" value={params.next || "/dashboard"} />
          <label className="field auth-field">
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </label>
          <label className="field auth-field">
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
      </div>

      <p className="auth-bottom auth-stagger-4">
        Launching a business workspace?{" "}
        <Link href="/register" className="forgot-link">
          Register your company →
        </Link>
        <br />
        <span>
          Invited clients can also use their invitation link to join an existing
          workspace.
        </span>
      </p>
    </div>
  );
}
