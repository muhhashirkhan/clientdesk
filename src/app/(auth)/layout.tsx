import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/ui";
import { LiquidEffect } from "@/components/liquid-effects";
import { Ambient } from "@/components/ambient";
import { GlassButtons } from "@/components/glass-buttons";
import { LockKeyhole, ArrowUpRight, ShieldCheck } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-shell">
      <GlassButtons />
      <section className="auth-art">
        <Ambient />
        <div className="auth-art-content">
          <div className="auth-art-header auth-reveal-1">
            <Link href="/login">
              <Logo />
            </Link>
            <span className="auth-core-badge" aria-hidden="true">
              <i /> THE AIQUOR CORE
            </span>
          </div>

          <div className="auth-hero-copy">
            <span className="glass-pill glass-container glass-container-pill auth-reveal-2">
              <i /> A CLEARER WAY TO COLLABORATE
            </span>
            <h1 className="auth-reveal-3">
              Good work.
              <br />
              Great <em>together.</em>
            </h1>
            <p className="auth-reveal-3">
              One shared space for your next big thing. Keep projects moving,
              feedback clear, and every detail in reach.
            </p>
            <div className="glass-card glass-container auth-reveal-4">
              <LiquidEffect
                kind="glass"
                shape="rounded"
                borderRadius={26}
                tintOpacity={0.22}
              />
              <span className="orbital-icon glass-container-circle">
                <Image
                  className="liquid-logo-fallback"
                  src="/brand/aiquor-metal-symbol.svg"
                  alt=""
                  width={80}
                  height={80}
                />
                <LiquidEffect kind="logo" />
              </span>
              <div>
                <strong>From first idea to final approval.</strong>
                <p>Projects · Files · Conversations · Approvals</p>
              </div>
            </div>
          </div>

          <footer className="auth-reveal-4">
            <span>AIQUOR / CLIENTDESK</span>
            <span className="auth-footer-meta" aria-hidden="true">
              OBSIDIAN OS · CORE ACTIVE
            </span>
            <a href="https://getaiquor.com" target="_blank" rel="noreferrer">
              Meet Aiquor <ArrowUpRight size={16} />
            </a>
          </footer>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        <div className="auth-form-content glass-container auth-console-enter">
          <div className="auth-console-bar" aria-hidden="true">
            <span>
              <i /> CLIENT PORTAL
            </span>
            <span>
              <ShieldCheck size={13} /> WORKSPACE SIGN-IN
            </span>
          </div>
          {children}
        </div>
        <p className="auth-security">
          <LockKeyhole size={14} /> A private space for you and Aiquor.
        </p>
      </section>
    </main>
  );
}
