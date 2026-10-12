import { session, check } from "@/lib/data";
import { WorkspaceShell } from "@/components/navigation";
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
    <>
      <GlassButtons />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <WorkspaceShell
        admin={profile.role === "admin"}
        unread={unread.count ?? 0}
        fullName={profile.full_name}
        email={user.email || ""}
      >
        {children}
      </WorkspaceShell>
    </>
  );
}
