"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";

const Gradient = dynamic(() => import("./gradient"), { ssr: false });
const AiquorCore = dynamic(() => import("./aiquor-core"), { ssr: false });

class SafeCanvas extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function StaticCoreFallback() {
  return (
    <div
      className="aiquor-core-fallback"
      data-testid="aiquor-core-fallback"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 480 480"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="aiquor-core-fallback-svg"
      >
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#24E5A0" stopOpacity="0.34" />
            <stop offset="48%" stopColor="#10221B" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#050907" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="titaniumRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D5F7A5" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#24E5A0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#84928B" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <circle cx="240" cy="240" r="210" fill="url(#coreGlow)" />
        <ellipse
          cx="240"
          cy="240"
          rx="188"
          ry="112"
          transform="rotate(-24 240 240)"
          stroke="url(#titaniumRing)"
          strokeWidth="1.2"
          strokeDasharray="6 8"
        />
        <ellipse
          cx="240"
          cy="240"
          rx="156"
          ry="92"
          transform="rotate(32 240 240)"
          stroke="url(#titaniumRing)"
          strokeWidth="1.4"
        />
        <circle
          cx="240"
          cy="240"
          r="128"
          stroke="rgba(213, 247, 165, 0.18)"
          strokeWidth="1"
        />
        <polygon
          points="240,136 330,240 240,344 150,240"
          fill="rgba(16, 34, 27, 0.55)"
          stroke="rgba(36, 229, 160, 0.45)"
          strokeWidth="1.4"
        />
        <polygon
          points="240,162 308,240 240,318 172,240"
          fill="rgba(36, 229, 160, 0.12)"
          stroke="rgba(213, 247, 165, 0.55)"
          strokeWidth="1.1"
        />
        <circle cx="240" cy="240" r="22" fill="rgba(36, 229, 160, 0.28)" />
        <circle cx="240" cy="240" r="6" fill="#D5F7A5" />
      </svg>
    </div>
  );
}

export function Ambient({ workspace = false }: { workspace?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const onUnavailable = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setEnabled(!motion.matches);
    };
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);

  return (
    <div
      className={workspace ? "ambient workspace-ambient" : "ambient auth-ambient"}
      aria-hidden="true"
    >
      {!workspace && <StaticCoreFallback />}
      {enabled && !failed && (
        <SafeCanvas>{workspace ? <Gradient onUnavailable={onUnavailable} /> : <AiquorCore onUnavailable={onUnavailable} />}</SafeCanvas>
      )}
    </div>
  );
}
