"use client";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";
import { CanvasLifecycle } from "./canvas-lifecycle";
export default function Gradient({ onUnavailable }: { onUnavailable: () => void }) {
  return (
    <ShaderGradientCanvas
      style={{ position: "absolute", inset: 0 }}
      pixelDensity={1}
      fov={45}
    >
      <CanvasLifecycle onUnavailable={onUnavailable} />
      <ShaderGradient
        animate="on"
        type="plane"
        color1="#081a14"
        color2="#102b21"
        color3="#24e5a0"
        uSpeed={0.18}
        uStrength={2.4}
        uDensity={1.3}
        uFrequency={4.5}
        cDistance={3.8}
        cPolarAngle={90}
        cAzimuthAngle={0}
        grain="off"
      />
    </ShaderGradientCanvas>
  );
}
