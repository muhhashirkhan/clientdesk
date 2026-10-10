"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CheckCheck,
  Bell,
  Settings,
  LogOut,
} from "lucide-react";
import { Form } from "./forms";
import { signOut } from "@/app/actions";
export function Navigation({
  admin,
  unread,
}: {
  admin: boolean;
  unread: number;
}) {
  const path = usePathname();
  const links = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    ...(admin ? [{ href: "/clients", label: "Clients", icon: Users }] : []),
    { href: "/approvals", label: "Approvals", icon: CheckCheck },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  return (
    <>
      <nav aria-label="Main navigation">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            href={href}
            key={href}
            aria-current={path.startsWith(href) ? "page" : undefined}
            className={path.startsWith(href) ? "nav-link active" : "nav-link"}
          >
            <Icon size={18} />
            <span>{label}</span>
            {href === "/notifications" && unread > 0 && (
              <span className="count">{unread}</span>
            )}
          </Link>
        ))}
      </nav>
      <div className="sign-out">
        <LogOut size={17} />
        <Form action={signOut} submit="Sign out" className="plain-form" />
      </div>
    </>
  );
}
