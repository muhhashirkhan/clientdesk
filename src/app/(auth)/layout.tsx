import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/ui";
import { LiquidEffect } from "@/components/liquid-effects";
import { Ambient } from "@/components/ambient";
import { GlassButtons } from "@/components/glass-buttons";
import { LockKeyhole, ArrowUpRight } from "lucide-react";

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
                borderRadius={20}
                tintOpacity={0.18}
              />
              <span className="orbital-icon glass-container-circle">
                <Image
                  className="liquid-logo-fallback"
                  src="/brand/aiquor-metal-symbol.svg"
                  alt=""
                  width={52}
                  height={52}
                />
                <LiquidEffect kind="logo" />
              </span>
              <div className="glass-card-body">
                <strong>From first idea to final approval.</strong>
                <p>Projects · Files · Conversations · Approvals</p>
              </div>
            </div>
          </div>

          <footer className="auth-reveal-4">
            <span>AIQUOR / CLIENTDESK</span>
            <a href="https://getaiquor.com" target="_blank" rel="noreferrer">
              Meet Aiquor <ArrowUpRight size={15} />
            </a>
          </footer>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        <div className="auth-form-content glass-container auth-console-enter">
          {children}
        </div>
        <p className="auth-security">
          <LockKeyhole size={13} /> A private space for you and Aiquor.
        </p>
      </section>
    </main>
  );
}
