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
          <radialGradient id="monolithGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#24E5A0" stopOpacity="0.28" />
            <stop offset="48%" stopColor="#10221B" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#050907" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="monolithGlass" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#1A382B" stopOpacity="0.88" />
            <stop offset="50%" stopColor="#07120E" stopOpacity="0.94" />
            <stop offset="100%" stopColor="#0E261C" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="titaniumBezel" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D5F7A5" stopOpacity="0.65" />
            <stop offset="45%" stopColor="#5C746A" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#1C2622" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="emeraldChamber" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#D5F7A5" stopOpacity="0.75" />
            <stop offset="50%" stopColor="#24E5A0" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0E4430" stopOpacity="0.6" />
          </linearGradient>
        </defs>

        <circle cx="240" cy="240" r="200" fill="url(#monolithGlow)" />

        {/* Secondary Asymmetric Titanium Counter-Arc */}
        <path
          d="M 118 282 A 136 82 0 1 1 352 184"
          stroke="rgba(132, 146, 139, 0.32)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Central Beveled Obsidian Monolith */}
        <polygon
          points="196,104 284,104 312,132 312,348 284,376 196,376 168,348 168,132"
          fill="url(#monolithGlass)"
          stroke="url(#titaniumBezel)"
          strokeWidth="2"
        />

        {/* Titanium Crown & Base End-Caps */}
        <polygon
          points="202,94 278,94 294,110 186,110"
          fill="#222E29"
          stroke="rgba(213, 247, 165, 0.35)"
          strokeWidth="1.2"
        />
        <polygon
          points="186,370 294,370 278,386 202,386"
          fill="#222E29"
          stroke="rgba(213, 247, 165, 0.35)"
          strokeWidth="1.2"
        />

        {/* Internal Faceted Emerald Crystal Chamber */}
        <polygon
          points="240,144 274,186 274,294 240,336 206,294 206,186"
          fill="rgba(16, 58, 42, 0.65)"
          stroke="rgba(36, 229, 160, 0.55)"
          strokeWidth="1.4"
        />
        <rect
          x="228"
          y="178"
          width="24"
          height="124"
          rx="12"
          fill="url(#emeraldChamber)"
          opacity="0.78"
        />

        {/* Dominant Machined Titanium Orbital Gimbal */}
        <ellipse
          cx="240"
          cy="240"
          rx="178"
          ry="96"
          transform="rotate(-24 240 240)"
          stroke="url(#titaniumBezel)"
          strokeWidth="8"
        />
        <ellipse
          cx="240"
          cy="240"
          rx="172"
          ry="91"
          transform="rotate(-24 240 240)"
          stroke="rgba(36, 229, 160, 0.55)"
          strokeWidth="1.5"
        />
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
        <SafeCanvas>
          {workspace ? (
            <Gradient onUnavailable={onUnavailable} />
          ) : (
            <AiquorCore onUnavailable={onUnavailable} />
          )}
        </SafeCanvas>
      )}
    </div>
  );
}
