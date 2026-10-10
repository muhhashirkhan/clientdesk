"use client";
import { useEffect, useRef } from "react";

export type GlassShapeType = "rounded" | "circle" | "pill";

export interface GlassControlsConfig {
  edgeIntensity: number;
  rimIntensity: number;
  baseIntensity: number;
  edgeDistance: number;
  rimDistance: number;
  baseDistance: number;
  cornerBoost: number;
  rippleEffect: number;
  blurRadius: number;
  tintOpacity: number;
}

export const DEFAULT_GLASS_CONTROLS: GlassControlsConfig = {
  edgeIntensity: 0.028,
  rimIntensity: 0.085,
  baseIntensity: 0.014,
  edgeDistance: 0.15,
  rimDistance: 0.8,
  baseDistance: 0.1,
  cornerBoost: 0.032,
  rippleEffect: 0.06,
  blurRadius: 6.5,
  tintOpacity: 0.22,
};

declare global {
  interface Window {
    glassControls?: Partial<GlassControlsConfig>;
    updateAllGlassInstances?: () => void;
    Container?: unknown;
    Button?: unknown;
  }
}

const activeUpdaters = new Set<() => void>();

export function triggerAllGlassEffectsUpdate() {
  activeUpdaters.forEach((fn) => fn());
}

function drawBackdropTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  variant: "dark" | "light" | "button" | "circle",
) {
  ctx.clearRect(0, 0, width, height);
  if (variant === "dark") {
    // Obsidian OS dark forest + emerald/lime backdrop for glass surfaces
    const base = ctx.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#0b1a14");
    base.addColorStop(0.45, "#10221b");
    base.addColorStop(1, "#07100c");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const orb1 = ctx.createRadialGradient(
      width * 0.22,
      height * 0.28,
      8,
      width * 0.22,
      height * 0.28,
      width * 0.46,
    );
    orb1.addColorStop(0, "rgba(36, 229, 160, 0.42)");
    orb1.addColorStop(1, "rgba(36, 229, 160, 0)");
    ctx.fillStyle = orb1;
    ctx.fillRect(0, 0, width, height);

    const orb2 = ctx.createRadialGradient(
      width * 0.76,
      height * 0.24,
      10,
      width * 0.76,
      height * 0.24,
      width * 0.42,
    );
    orb2.addColorStop(0, "rgba(213, 247, 165, 0.34)");
    orb2.addColorStop(1, "rgba(213, 247, 165, 0)");
    ctx.fillStyle = orb2;
    ctx.fillRect(0, 0, width, height);

    const orb3 = ctx.createRadialGradient(
      width * 0.58,
      height * 0.82,
      8,
      width * 0.58,
      height * 0.82,
      width * 0.48,
    );
    orb3.addColorStop(0, "rgba(20, 82, 58, 0.55)");
    orb3.addColorStop(0.5, "rgba(36, 229, 160, 0.22)");
    orb3.addColorStop(1, "rgba(16, 34, 27, 0)");
    ctx.fillStyle = orb3;
    ctx.fillRect(0, 0, width, height);
  } else if (variant === "button" || variant === "circle") {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#122a20");
    gradient.addColorStop(0.5, "#193b2d");
    gradient.addColorStop(1, "#0d1d16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(213, 247, 165, 0.42)";
    ctx.beginPath();
    ctx.ellipse(
      width * 0.72,
      height * 0.18,
      width * 0.28,
      height * 0.36,
      -0.35,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.fillStyle = "rgba(36, 229, 160, 0.38)";
    ctx.beginPath();
    ctx.ellipse(
      width * 0.24,
      height * 0.78,
      width * 0.3,
      height * 0.34,
      0.25,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#101b16");
    gradient.addColorStop(0.5, "#13241c");
    gradient.addColorStop(1, "#0b130f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(213, 247, 165, 0.26)";
    ctx.beginPath();
    ctx.ellipse(
      width * 0.75,
      height * 0.16,
      width * 0.32,
      height * 0.38,
      -0.4,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.fillStyle = "rgba(36, 229, 160, 0.22)";
    ctx.beginPath();
    ctx.ellipse(
      width * 0.22,
      height * 0.78,
      width * 0.3,
      height * 0.34,
      0.25,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

// The original MIT-licensed shaders are served locally; no screenshots of the
// page or account data are captured. Glass samples a decorative texture only.
export function LiquidEffect({
  kind,
  button = false,
  shape,
  warp,
  borderRadius: customBorderRadius,
  tintOpacity: customTintOpacity,
  variant,
  parentCanvas,
  onRender,
}: {
  kind: "logo" | "glass" | "glass-nested";
  button?: boolean;
  shape?: GlassShapeType;
  warp?: boolean;
  borderRadius?: number;
  tintOpacity?: number;
  variant?: "dark" | "light" | "button" | "circle";
  parentCanvas?: HTMLCanvasElement | null;
  onRender?: (canvas: HTMLCanvasElement) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false,
      frame = 0,
      dispose = () => {};
    const controller = new AbortController();
    async function start() {
      if (!canvas) return;
      const vertFile = kind === "logo" ? "logo.vert" : "glass.vert";
      const fragFile =
        kind === "logo"
          ? "logo.frag"
          : kind === "glass-nested"
            ? "glass-nested.frag"
            : "glass.frag";
      const sources = await Promise.all(
        [vertFile, fragFile].map(async (file) => {
          const r = await fetch(`/effects/${file}`, {
            signal: controller.signal,
          });
          if (!r.ok) throw Error("Effect unavailable");
          return r.text();
        }),
      );
      if (cancelled) return;
      const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) return;
      const shaders: WebGLShader[] = [],
        buffers: WebGLBuffer[] = [];
      const program = gl.createProgram();
      const texture = gl.createTexture();
      dispose = () => {
        cancelAnimationFrame(frame);
        buffers.forEach((b) => gl.deleteBuffer(b));
        shaders.forEach((s) => gl.deleteShader(s));
        gl.deleteTexture(texture);
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
      if (!program || !texture) throw new Error("Effect unavailable");
      sources.forEach((source, i) => {
        const shader = gl.createShader(
          i === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER,
        )!;
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error("Shader unsupported");
        gl.attachShader(program, shader);
      });
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error("Effect unsupported");
      gl.useProgram(program);
      function attribute(name: string, values: number[]) {
        const loc = gl!.getAttribLocation(program!, name);
        if (loc < 0) return;
        const buffer = gl!.createBuffer()!;
        buffers.push(buffer);
        gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
        gl!.bufferData(
          gl!.ARRAY_BUFFER,
          new Float32Array(values),
          gl!.STATIC_DRAW,
        );
        gl!.enableVertexAttribArray(loc);
        gl!.vertexAttribPointer(loc, 2, gl!.FLOAT, false, 0, 0);
      }
      attribute(
        kind === "logo" ? "aVertexPosition" : "a_position",
        [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
      );
      if (kind !== "logo")
        attribute("a_texcoord", [0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);
      const art = document.createElement("canvas");
      art.width = 512;
      art.height = kind === "logo" ? 512 : 256;
      const ctx = art.getContext("2d")!;
      if (kind === "logo") {
        const image = new Image();
        image.src = "/brand/aiquor-liquid-mask.svg";
        await image.decode();
        if (cancelled) return;
        ctx.drawImage(image, 0, 0, 512, 512);
      } else {
        const resolvedVariant =
          variant || (button ? "button" : "dark");
        drawBackdropTexture(ctx, art.width, art.height, resolvedVariant);
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        parentCanvas && parentCanvas.width > 0 ? parentCanvas : art,
      );
      for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
        gl.texParameteri(gl.TEXTURE_2D, param, gl.LINEAR);
      for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
        gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
      gl.uniform1i(
        gl.getUniformLocation(
          program,
          kind === "logo" ? "u_logoTexture" : "u_image",
        ),
        0,
      );

      const applyUniforms = (width: number, height: number) => {
        if (kind === "logo") {
          const logoValues = {
            speed: 0.1,
            iterations: 11,
            scale: 0.112,
            dotFactor: 0.28,
            dotMultiplier: 0.36,
            vOffset: 0,
            intensityFactor: 0.12,
            expFactor: 0.1,
            noiseIntensity: 0.08,
            colorShift: 0.12,
            logoOpacity: 0,
            logoScale: 1,
            logoInteractStrength: 0.5,
          };
          for (const [key, value] of Object.entries(logoValues))
            gl.uniform1f(gl.getUniformLocation(program, "u_" + key), value);
          gl.uniform3f(
            gl.getUniformLocation(program, "u_colorFactors"),
            1.2,
            1.3,
            1.1,
          );
          gl.uniform1i(gl.getUniformLocation(program, "u_logoBlendMode"), 0);
          return;
        }

        const controls = {
          ...DEFAULT_GLASS_CONTROLS,
          ...(typeof window !== "undefined" ? window.glassControls : {}),
        };
        const resolvedShape: GlassShapeType =
          shape || (button ? "pill" : "rounded");
        const resolvedRadius =
          resolvedShape === "circle"
            ? Math.min(width, height) / 2
            : resolvedShape === "pill"
              ? height / 2
              : (customBorderRadius ?? (button ? 40 : 18));

        const texW =
          parentCanvas && parentCanvas.width > 0
            ? parentCanvas.width
            : art.width;
        const texH =
          parentCanvas && parentCanvas.height > 0
            ? parentCanvas.height
            : art.height;

        const glassValues = {
          scrollY: typeof window !== "undefined" ? window.scrollY || 0 : 0,
          pageHeight:
            typeof document !== "undefined"
              ? Math.max(
                  document.body?.scrollHeight || 800,
                  document.documentElement?.scrollHeight || 800,
                )
              : 1000,
          viewportHeight:
            typeof window !== "undefined" ? window.innerHeight || 800 : 800,
          blurRadius: controls.blurRadius,
          borderRadius: resolvedRadius,
          warp: warp !== undefined ? (warp ? 1 : 0) : button ? 1 : 0,
          edgeIntensity: controls.edgeIntensity,
          rimIntensity: controls.rimIntensity,
          baseIntensity: controls.baseIntensity,
          edgeDistance: controls.edgeDistance,
          rimDistance: controls.rimDistance,
          baseDistance: controls.baseDistance,
          cornerBoost: controls.cornerBoost,
          rippleEffect: controls.rippleEffect,
          tintOpacity: customTintOpacity ?? controls.tintOpacity,
        };
        for (const [key, value] of Object.entries(glassValues)) {
          const loc = gl.getUniformLocation(program, "u_" + key);
          if (loc) gl.uniform1f(loc, value);
        }
        gl.uniform2f(
          gl.getUniformLocation(program, "u_textureSize"),
          texW,
          texH,
        );
        gl.uniform2f(
          gl.getUniformLocation(program, "u_containerPosition"),
          texW / 2,
          texH / 2,
        );
        if (kind === "glass-nested") {
          gl.uniform2f(
            gl.getUniformLocation(program, "u_containerSize"),
            texW,
            texH,
          );
          gl.uniform2f(
            gl.getUniformLocation(program, "u_buttonPosition"),
            texW / 2,
            texH / 2,
          );
        }
      };

      let last = 0,
        elapsed = 0;
      const draw = (time: number) => {
        if (cancelled) return;
        const box = canvas.getBoundingClientRect();
        const visible = !document.hidden && box.width > 0 && box.height > 0;
        if (visible && (time - last > 40 || last === 0)) {
          elapsed += motion.matches ? 0 : Math.min(time - last, 80);
          last = time;
          const w = Math.max(1, Math.round(box.width));
          const h = Math.max(1, Math.round(box.height));
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
          }
          gl.viewport(0, 0, canvas.width, canvas.height);
          if (parentCanvas && parentCanvas.width > 0 && kind === "glass-nested") {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              parentCanvas,
            );
          }
          applyUniforms(canvas.width, canvas.height);
          gl.uniform2f(
            gl.getUniformLocation(program, "u_resolution"),
            canvas.width,
            canvas.height,
          );
          gl.uniform1f(
            gl.getUniformLocation(program, "u_time"),
            elapsed / 1000,
          );
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          canvas.dataset.ready = "true";
          onRender?.(canvas);
        }
        if (visible && kind === "logo" && !motion.matches)
          frame = requestAnimationFrame(draw);
      };
      const redraw = () => {
        cancelAnimationFrame(frame);
        last = 0;
        if (!document.hidden) frame = requestAnimationFrame(draw);
      };
      redraw();
      activeUpdaters.add(redraw);
      motion.addEventListener("change", redraw);
      document.addEventListener("visibilitychange", redraw);
      const resize = new ResizeObserver(redraw);
      resize.observe(canvas);
      const cleanup = dispose;
      dispose = () => {
        activeUpdaters.delete(redraw);
        resize.disconnect();
        motion.removeEventListener("change", redraw);
        document.removeEventListener("visibilitychange", redraw);
        cleanup();
      };
    }
    // Hidden responsive artwork must not reserve a WebGL context or poll every frame.
    let started = false;
    const maybeStart = () => {
      const box = canvas.getBoundingClientRect();
      if (started || cancelled || document.hidden || box.width === 0 || box.height === 0) return;
      started = true;
      start().catch(() => dispose());
    };
    const visibilityObserver = new ResizeObserver(maybeStart);
    visibilityObserver.observe(canvas);
    document.addEventListener("visibilitychange", maybeStart);
    maybeStart();
    return () => {
      cancelled = true;
      controller.abort();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", maybeStart);
      dispose();
    };
  }, [
    kind,
    button,
    shape,
    warp,
    customBorderRadius,
    customTintOpacity,
    variant,
    parentCanvas,
    onRender,
  ]);
  const className =
    kind === "logo" ? "liquid-logo" : "liquid-glass";
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
