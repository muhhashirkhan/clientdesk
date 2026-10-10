"use client";
import { useEffect, useRef } from "react";

// The original MIT-licensed shaders are served locally; no screenshots of the
// page or account data are captured. Glass samples a decorative texture only.
export function LiquidEffect({ kind, button = false, onRender }: {
  kind: "logo" | "glass";
  button?: boolean;
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
      const sources = await Promise.all(
        ["vert", "frag"].map(async (ext) => {
          const r = await fetch(`/effects/${kind}.${ext}`, {
            signal: controller.signal,
          });
          if (!r.ok) throw Error("Effect unavailable");
          return r.text();
        }),
      );
      if (cancelled) return;
      const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
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
      };
      if (!program || !texture) return;
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
      if (kind === "glass")
        attribute("a_texcoord", [0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);
      const art = document.createElement("canvas");
      art.width = 512;
      art.height = kind === "logo" ? 512 : 160;
      const ctx = art.getContext("2d")!;
      if (kind === "logo") {
        const image = new Image();
        image.src = "/brand/aiquor-liquid-mask.svg";
        await image.decode();
        if (cancelled) return;
        ctx.drawImage(image, 0, 0, 512, 512);
      } else {
        const gradient = ctx.createLinearGradient(0, 0, 512, 160);
        gradient.addColorStop(0, button ? "#d4c4ff" : "#335a49");
        gradient.addColorStop(0.6, button ? "#f4fce9" : "#6b8573");
        gradient.addColorStop(1, button ? "#a8e6db" : "#203e32");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 160);
        ctx.fillStyle = button ? "#ffffff" : "#c5dbad";
        ctx.beginPath();
        ctx.ellipse(390, 10, 130, 55, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art);
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
      const values =
        kind === "logo"
          ? {
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
            }
          : {
              scrollY: 0,
              blurRadius: 4,
              borderRadius: button ? 40 : 20,
              warp: 1,
              edgeIntensity: 0.025,
              rimIntensity: 0.08,
              baseIntensity: 0.01,
              edgeDistance: 0.12,
              rimDistance: 0.5,
              baseDistance: 0.1,
              cornerBoost: 0.025,
              rippleEffect: 0.02,
              tintOpacity: 0.08,
            };
      for (const [key, value] of Object.entries(values))
        gl.uniform1f(gl.getUniformLocation(program, "u_" + key), value);
      gl.uniform3f(
        gl.getUniformLocation(program, "u_colorFactors"),
        1.2,
        1.3,
        1.1,
      );
      gl.uniform1i(gl.getUniformLocation(program, "u_logoBlendMode"), 0);
      gl.uniform2f(
        gl.getUniformLocation(program, "u_textureSize"),
        art.width,
        art.height,
      );
      gl.uniform2f(
        gl.getUniformLocation(program, "u_containerPosition"),
        art.width / 2,
        art.height / 2,
      );
      let last = 0,
        elapsed = 0;
      const draw = (time: number) => {
        if (cancelled) return;
        const visible =
          !document.hidden && canvas.getBoundingClientRect().width > 0;
        if (visible && time - last > 40) {
          elapsed += motion.matches ? 0 : Math.min(time - last, 80);
          last = time;
          const box = canvas.getBoundingClientRect();
          canvas.width = Math.max(1, Math.round(box.width));
          canvas.height = Math.max(1, Math.round(box.height));
          gl.viewport(0, 0, canvas.width, canvas.height);
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
        if (kind === "logo" && !motion.matches)
          frame = requestAnimationFrame(draw);
      };
      const redraw = () => {
        cancelAnimationFrame(frame);
        last = 0;
        frame = requestAnimationFrame(draw);
      };
      redraw();
      motion.addEventListener("change", redraw);
      const resize = new ResizeObserver(redraw);
      resize.observe(canvas);
      const cleanup = dispose;
      dispose = () => {
        resize.disconnect();
        motion.removeEventListener("change", redraw);
        cleanup();
      };
    }
    start().catch(() => {
      dispose();
    });
    return () => {
      cancelled = true;
      controller.abort();
      dispose();
    };
  }, [kind, button, onRender]);
  return <canvas ref={ref} className={`liquid-${kind}`} aria-hidden="true" />;
}
