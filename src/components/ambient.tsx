"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
const Gradient = dynamic(() => import("./gradient"), { ssr: false });
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
export function Ambient({ workspace = false }: { workspace?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2");
      setEnabled(!motion.matches && !!context);
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    };
    update();
    motion.addEventListener("change", update);
    return () => motion.removeEventListener("change", update);
  }, []);
  return (
    <div className={workspace ? "ambient workspace-ambient" : "ambient"} aria-hidden="true">
      {enabled && (
        <SafeCanvas>
          <Gradient />
        </SafeCanvas>
      )}
    </div>
  );
}
