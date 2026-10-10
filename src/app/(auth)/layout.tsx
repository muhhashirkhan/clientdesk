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
          <Link href="/login">
            <Logo />
          </Link>
          <div>
            <span className="glass-pill">
              <i /> A CLEARER WAY TO COLLABORATE
            </span>
            <h1>
              Good work.
              <br />
              Great <em>together.</em>
            </h1>
            <p>
              One shared space for your next big thing. Keep projects moving,
              feedback clear, and every detail in reach.
            </p>
            <div className="glass-card">
              <LiquidEffect kind="glass" />
              <span className="orbital-icon">
                <Image className="liquid-logo-fallback" src="/brand/aiquor-metal-symbol.svg" alt="" width={80} height={80} />
                <LiquidEffect kind="logo" />
              </span>
              <div>
                <strong>From first idea to final approval.</strong>
                <p>Projects · Files · Conversations · Approvals</p>
              </div>
            </div>
          </div>
          <footer>
            <span>AIQUOR / CLIENTDESK</span>
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
        <div className="auth-form-content">{children}</div>
        <p className="auth-security">
          <LockKeyhole size={14} /> A private space for you and Aiquor.
        </p>
      </section>
    </main>
  );
}
