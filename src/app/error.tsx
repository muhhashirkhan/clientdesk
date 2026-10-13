"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone" role="alert">
      <p className="eyebrow">TEMPORARY ISSUE</p>
      <h1>We couldn’t load this page.</h1>
      <p>Your saved work is still in your workspace. Please try again.</p>
      <div className="command-header-actions">
        <button type="button" className="button primary" onClick={reset}>
          Try again
        </button>
        <Link href="/dashboard" className="button secondary">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
