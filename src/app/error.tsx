"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>We couldn’t load this page.</h1>
      <p>Your saved work is still in your workspace. Please try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
