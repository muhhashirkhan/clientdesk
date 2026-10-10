import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { session, check } from "@/lib/data";
import { Logo } from "@/components/ui";
import { Navigation } from "@/components/navigation";
import { RefreshButton } from "@/components/forms";
import { Ambient } from "@/components/ambient";
import { GlassButtons } from "@/components/glass-buttons";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { db, profile, user } = await session();
  const unread = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  check(unread.error);
  return (
    <div className="workspace">
      <GlassButtons />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/dashboard" aria-label="ClientDesk home">
          <Logo />
        </Link>
        <p className="nav-caption">
          {profile.role === "admin" ? "TEAM WORKSPACE" : "CLIENT WORKSPACE"}
        </p>
        <Navigation
          admin={profile.role === "admin"}
          unread={unread.count ?? 0}
        />
        <div className="sidebar-note glass-container">
          <ShieldCheck size={20} />
          <p>
            A shared space.
            <br />
            <strong>Your work, protected.</strong>
          </p>
          <a href="https://getaiquor.com" target="_blank" rel="noreferrer">
            Visit Aiquor <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="sidebar-user">
          <span className="avatar glass-container-circle">
            {(profile.full_name || user.email || "A").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{profile.full_name || "Your account"}</strong>
            <small>{profile.role === "admin" ? "Aiquor team" : "Client"}</small>
          </div>
        </div>
      </aside>
      <div className="main-column">
        <Ambient workspace />
        <header className="topbar glass-container">
          <span>
            <i className="live-dot" /> Your private project workspace
          </span>
          <div>
            <RefreshButton />
            <Link href="/settings" className="account-link glass-button">
              {profile.full_name || user.email}
            </Link>
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="workspace-footer">
          ClientDesk by Aiquor<span>Made for working together.</span>
        </footer>
      </div>
    </div>
  );
}
