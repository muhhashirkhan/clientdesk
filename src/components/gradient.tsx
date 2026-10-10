"use client";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";
export default function Gradient() {
  return (
    <ShaderGradientCanvas
      style={{ position: "absolute", inset: 0 }}
      pixelDensity={1}
      fov={45}
    >
      <ShaderGradient
        animate="on"
        type="plane"
        color1="#9873ff"
        color2="#ffb18e"
        color3="#68e4cf"
        uSpeed={0.22}
        uStrength={3}
        uDensity={1.5}
        uFrequency={5.5}
        cDistance={3.6}
        cPolarAngle={90}
        cAzimuthAngle={0}
        grain="off"
      />
    </ShaderGradientCanvas>
  );
}
