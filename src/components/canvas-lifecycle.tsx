"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

// Stop rendering, not just uniform updates, while the tab is hidden.
export function CanvasLifecycle({ onUnavailable }: { onUnavailable: () => void }) {
  const gl = useThree((state) => state.gl);
  const setFrameloop = useThree((state) => state.setFrameloop);

  useEffect(() => {
    const update = () => setFrameloop(document.hidden ? "never" : "always");
    const lost = () => onUnavailable();
    const previousShaderError = gl.debug.onShaderError;
    gl.debug.onShaderError = onUnavailable;
    update();
    document.addEventListener("visibilitychange", update);
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      document.removeEventListener("visibilitychange", update);
      gl.domElement.removeEventListener("webglcontextlost", lost);
      gl.debug.onShaderError = previousShaderError;
    };
  }, [gl, setFrameloop, onUnavailable]);

  return null;
}
