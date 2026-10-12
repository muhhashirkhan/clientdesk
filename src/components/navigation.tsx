"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CheckCheck,
  Bell,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ShieldCheck,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { Form, RefreshButton } from "./forms";
import { signOut } from "@/app/actions";
import { Ambient } from "./ambient";

const SIDEBAR_STORAGE_KEY = "obsidian-sidebar-collapsed";
const MOBILE_BREAKPOINT = 900;

const sidebarListeners = new Set<() => void>();

function subscribeSidebarCollapsed(callback: () => void): () => void {
  sidebarListeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SIDEBAR_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    sidebarListeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSidebarCollapsedSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getSidebarCollapsedServerSnapshot(): boolean {
  return false;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

function getRouteMeta(pathname: string): {
  sectionLabel: string;
  sectionHref: string;
  pageTitle: string;
} {
  if (pathname === "/dashboard") {
    return {
      sectionLabel: "Workspace",
      sectionHref: "/dashboard",
      pageTitle: "Overview",
    };
  }
  if (pathname === "/projects/new") {
    return {
      sectionLabel: "Projects",
      sectionHref: "/projects",
      pageTitle: "New project",
    };
  }
  if (pathname.startsWith("/projects/")) {
    return {
      sectionLabel: "Projects",
      sectionHref: "/projects",
      pageTitle: "Project workspace",
    };
  }
  if (pathname.startsWith("/projects")) {
    return {
      sectionLabel: "Workspace",
      sectionHref: "/dashboard",
      pageTitle: "Projects",
    };
  }
  if (pathname.startsWith("/clients")) {
    return {
      sectionLabel: "Workspace",
      sectionHref: "/dashboard",
      pageTitle: "Clients",
    };
  }
  if (pathname.startsWith("/approvals")) {
    return {
      sectionLabel: "Workspace",
      sectionHref: "/dashboard",
      pageTitle: "Approvals",
    };
  }
  if (pathname.startsWith("/notifications")) {
    return {
      sectionLabel: "Workspace",
      sectionHref: "/dashboard",
      pageTitle: "Notifications",
    };
  }
  if (pathname.startsWith("/settings")) {
    return {
      sectionLabel: "Account",
      sectionHref: "/settings",
      pageTitle: "Settings",
    };
  }
  return {
    sectionLabel: "Workspace",
    sectionHref: "/dashboard",
    pageTitle: "ClientDesk",
  };
}

export function Navigation({
  admin,
  unread,
  collapsed = false,
  onNavigate,
}: {
  admin: boolean;
  unread: number;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();

  const primaryLinks: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    ...(admin ? [{ href: "/clients", label: "Clients", icon: Users }] : []),
    { href: "/approvals", label: "Approvals", icon: CheckCheck },
  ];

  const systemLinks: NavItem[] = [
    {
      href: "/notifications",
      label: "Notifications",
      icon: Bell,
      badge: unread > 0 ? unread : undefined,
    },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const renderLink = ({ href, label, icon: Icon, badge }: NavItem) => {
    const active =
      href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
    const tooltipText =
      badge !== undefined ? `${label} (${badge} unread)` : label;

    return (
      <Link
        href={href}
        key={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        data-tooltip={collapsed ? tooltipText : undefined}
        className={active ? "nav-link active" : "nav-link"}
      >
        <span className="nav-active-indicator" aria-hidden="true" />
        <span className="nav-icon-wrap">
          <Icon size={18} aria-hidden="true" />
          {collapsed && badge !== undefined && (
            <span className="nav-collapsed-dot" aria-hidden="true" />
          )}
        </span>
        <span className="nav-label">{label}</span>
        {badge !== undefined && (
          <span className="count" aria-label={`${badge} unread notifications`}>
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="sidebar-nav-groups">
      <div className="sidebar-nav-section">
        <p className="nav-caption" aria-hidden={collapsed ? "true" : undefined}>
          {admin ? "TEAM WORKSPACE" : "CLIENT WORKSPACE"}
        </p>
        <nav aria-label="Main navigation" className="sidebar-nav-list">
          {primaryLinks.map(renderLink)}
        </nav>
      </div>

      <div className="sidebar-nav-section">
        <p className="nav-caption" aria-hidden={collapsed ? "true" : undefined}>
          SYSTEM
        </p>
        <nav aria-label="System navigation" className="sidebar-nav-list">
          {systemLinks.map(renderLink)}
        </nav>
      </div>
    </div>
  );
}

export function WorkspaceShell({
  admin,
  unread,
  fullName,
  email,
  children,
}: {
  admin: boolean;
  unread: number;
  fullName: string;
  email: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getSidebarCollapsedServerSnapshot,
  );
  const [openPathname, setOpenPathname] = useState<string | null>(null);
  const mobileOpen = openPathname === pathname;

  const sidebarRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const toggleDesktopCollapse = useCallback(() => {
    try {
      const next = !getSidebarCollapsedSnapshot();
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      sidebarListeners.forEach((listener) => listener());
    } catch {
      // Ignore storage errors
    }
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setOpenPathname(null);
  }, []);

  const toggleMobileDrawer = useCallback(() => {
    setOpenPathname((prev) => (prev === pathname ? null : pathname));
  }, [pathname]);

  // Close mobile drawer if viewport resizes above mobile/tablet breakpoint
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        setOpenPathname(null);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keyboard shortcut (Cmd+B / Ctrl+B) for desktop sidebar toggle + Escape & Focus Trap for mobile drawer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        if (window.innerWidth <= MOBILE_BREAKPOINT) {
          toggleMobileDrawer();
        } else {
          toggleDesktopCollapse();
        }
        return;
      }

      if (e.key === "Escape" && mobileOpen) {
        e.preventDefault();
        setOpenPathname(null);
        triggerRef.current?.focus();
        return;
      }

      if (e.key === "Tab" && mobileOpen && sidebarRef.current) {
        const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen, toggleDesktopCollapse, toggleMobileDrawer]);

  // Lock body scroll and focus close button when mobile drawer opens
  useEffect(() => {
    if (!mobileOpen) {
      document.body.style.removeProperty("overflow");
      return;
    }
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 30);
    return () => {
      window.clearTimeout(timer);
      document.body.style.removeProperty("overflow");
    };
  }, [mobileOpen]);

  const handleTriggerClick = () => {
    if (
      typeof window !== "undefined" &&
      window.innerWidth <= MOBILE_BREAKPOINT
    ) {
      toggleMobileDrawer();
    } else {
      toggleDesktopCollapse();
    }
  };

  const displayName = fullName || "Your account";
  const displayInitial = (fullName || email || "A").slice(0, 1).toUpperCase();
  const roleLabel = admin ? "Aiquor team" : "Client";
  const { sectionLabel, sectionHref, pageTitle } = getRouteMeta(pathname);

  return (
    <div
      className="workspace"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      data-mobile-nav-open={mobileOpen ? "true" : "false"}
    >
      {/* Mobile / Tablet Backdrop Overlay */}
      <div
        className={
          mobileOpen ? "sidebar-backdrop is-open" : "sidebar-backdrop"
        }
        aria-hidden="true"
        onClick={closeMobileDrawer}
      />

      <aside
        id="obsidian-sidebar"
        ref={sidebarRef}
        className={collapsed ? "sidebar is-collapsed" : "sidebar"}
        aria-label="Workspace navigation"
      >
        {/* Top Brand Section */}
        <div className="sidebar-brand-bar">
          <Link
            href="/dashboard"
            aria-label="Aiquor ClientDesk home"
            onClick={closeMobileDrawer}
            data-tooltip={collapsed ? "Aiquor ClientDesk" : undefined}
            className="sidebar-brand-link"
          >
            <span className="logo">
              <span className="logo-mark">
                <Image
                  src="/brand/aiquor-symbol.svg"
                  alt=""
                  width={34}
                  height={34}
                />
              </span>
              <span className="sidebar-brand-copy">
                <small className="sidebar-brand-eyebrow">AIQUOR</small>
                <span className="sidebar-brand-title">CLIENTDESK</span>
              </span>
            </span>
          </Link>

          <button
            ref={closeBtnRef}
            type="button"
            className="sidebar-mobile-close"
            onClick={closeMobileDrawer}
            aria-label="Close navigation menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Links */}
        <Navigation
          admin={admin}
          unread={unread}
          collapsed={collapsed}
          onNavigate={closeMobileDrawer}
        />

        {/* Bottom Workspace Controls & Account Card */}
        <div className="sidebar-footer">
          <div className="sidebar-note glass-container">
            <div className="sidebar-note-head">
              <ShieldCheck size={16} />
              <span>Encrypted workspace</span>
            </div>
            <p>
              A shared space. <strong>Your work, protected.</strong>
            </p>
            <a href="https://getaiquor.com" target="_blank" rel="noreferrer">
              Visit Aiquor <ArrowUpRight size={13} />
            </a>
          </div>

          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleDesktopCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            data-tooltip={collapsed ? "Expand sidebar (⌘B)" : undefined}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={17} aria-hidden="true" />
            )}
            <span className="sidebar-collapse-label">Collapse sidebar</span>
            <kbd className="sidebar-kbd" aria-hidden="true">
              ⌘B
            </kbd>
          </button>

          <div className="sidebar-user">
            <Link
              href="/settings"
              onClick={closeMobileDrawer}
              className="sidebar-user-profile"
              aria-label={`Account settings for ${displayName}`}
              data-tooltip={
                collapsed ? `${displayName} · ${roleLabel}` : undefined
              }
            >
              <span className="avatar glass-container-circle">
                {displayInitial}
              </span>
              <span className="sidebar-user-meta">
                <strong>{displayName}</strong>
                <small>{email || roleLabel}</small>
              </span>
            </Link>

            <div
              className="sign-out"
              data-tooltip={collapsed ? "Sign out" : undefined}
            >
              <LogOut size={16} aria-hidden="true" />
              <Form
                action={signOut}
                submit="Sign out"
                className="plain-form"
              />
            </div>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <Ambient workspace />
        <header className="topbar glass-container">
          <div className="topbar-left">
            <button
              ref={triggerRef}
              type="button"
              className="sidebar-trigger icon-button glass-button"
              onClick={handleTriggerClick}
              aria-label="Toggle workspace navigation"
              aria-controls="obsidian-sidebar"
              aria-expanded={mobileOpen || !collapsed}
              title="Toggle navigation (⌘B)"
            >
              <Menu
                size={17}
                className="trigger-icon-mobile"
                aria-hidden="true"
              />
              {collapsed ? (
                <PanelLeftOpen
                  size={17}
                  className="trigger-icon-desktop"
                  aria-hidden="true"
                />
              ) : (
                <PanelLeftClose
                  size={17}
                  className="trigger-icon-desktop"
                  aria-hidden="true"
                />
              )}
            </button>

            <span className="topbar-divider" aria-hidden="true" />

            <nav aria-label="Breadcrumb" className="topbar-breadcrumb">
              <Link href={sectionHref} className="topbar-crumb-parent">
                {sectionLabel}
              </Link>
              <ChevronRight
                size={14}
                className="topbar-crumb-sep"
                aria-hidden="true"
              />
              <span className="topbar-crumb-current" aria-current="page">
                {pageTitle}
              </span>
            </nav>
          </div>

          <div className="topbar-right">
            <span className="topbar-workspace-pill">
              <i className="live-dot" aria-hidden="true" />
              <span>
                {admin ? "Team workspace" : "Your private workspace"}
              </span>
            </span>

            <RefreshButton />

            <Link
              href="/notifications"
              className="icon-button topbar-notify-btn glass-button glass-button-circle"
              aria-label={
                unread > 0
                  ? `Notifications (${unread} unread)`
                  : "Notifications"
              }
              title={
                unread > 0
                  ? `Notifications (${unread} unread)`
                  : "Notifications"
              }
            >
              <Bell size={16} aria-hidden="true" />
              {unread > 0 && (
                <span className="topbar-notify-badge" aria-hidden="true">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>

            <Link
              href="/settings"
              className="account-link glass-button"
              aria-label={`Account settings (${fullName || email})`}
            >
              <span className="account-link-avatar" aria-hidden="true">
                {displayInitial}
              </span>
              <span className="account-link-name">{fullName || email}</span>
            </Link>
          </div>
        </header>

        <main id="main" className="main-content">
          {children}
        </main>

        <footer className="workspace-footer">
          <span>ClientDesk by Aiquor</span>
          <span>Made for working together.</span>
        </footer>
      </div>
    </div>
  );
}
