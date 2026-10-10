import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <p className="eyebrow">NOT AVAILABLE</p>
      <h1>This page isn’t in your workspace.</h1>
      <p>It may have moved, or you may not have access.</p>
      <Link href="/dashboard" className="button primary">
        Back to your dashboard
      </Link>
    </main>
  );
}
