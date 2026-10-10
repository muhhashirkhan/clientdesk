"use client";
import { useCallback, useEffect, useRef } from "react";
import { LiquidEffect } from "./liquid-effects";

// One upstream glass shader creates the decorative surface shared by native
// buttons. This avoids a WebGL context per action and preserves form semantics.
export function GlassButtons() {
  const ref = useRef<HTMLDivElement>(null);
  const render = useCallback((canvas: HTMLCanvasElement) => {
    const scope = ref.current?.parentElement;
    if (!scope) return;
    scope.style.setProperty("--liquid-button-texture", `url("${canvas.toDataURL()}")`);
    scope.dataset.glassReady = "true";
  }, []);
  useEffect(() => {
    const scope = ref.current?.parentElement;
    return () => {
      scope?.style.removeProperty("--liquid-button-texture");
      if (scope) delete scope.dataset.glassReady;
    };
  }, []);
  return <div ref={ref} className="glass-button-renderer" aria-hidden="true">
    <LiquidEffect kind="glass" button onRender={render} />
  </div>;
}
