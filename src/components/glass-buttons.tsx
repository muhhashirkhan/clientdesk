"use client";
import { useEffect, useRef } from "react";
import {
  DEFAULT_GLASS_CONTROLS,
  triggerAllGlassEffectsUpdate,
  type GlassControlsConfig,
  type GlassShapeType,
} from "./liquid-effects";

export interface ContainerOptions {
  borderRadius?: number;
  type?: GlassShapeType;
  tintOpacity?: number;
  warp?: boolean;
}

export interface ButtonOptions extends ContainerOptions {
  text?: string;
  size?: number;
  onClick?: ((text: string) => void) | null;
}

// Programmatic Container & Button classes compatible with liquid-glass-js API
export class GlassContainer {
  static instances: GlassContainer[] = [];
  static pageSnapshot: HTMLCanvasElement | null = null;

  width = 0;
  height = 0;
  borderRadius: number;
  type: GlassShapeType;
  tintOpacity: number;
  warp = false;
  canvas: HTMLCanvasElement;
  element: HTMLDivElement;
  gl: WebGLRenderingContext | null = null;
  gl_refs: Record<string, unknown> = {};
  webglInitialized = false;
  children: GlassContainer[] = [];
  parent: GlassContainer | null = null;
  isNestedGlass = false;
  render?: () => void;

  constructor(options: ContainerOptions = {}) {
    this.borderRadius = options.borderRadius ?? 48;
    this.type = options.type ?? "rounded";
    this.tintOpacity = options.tintOpacity ?? 0.2;
    this.warp = options.warp ?? false;

    this.element = document.createElement("div");
    this.element.className = "glass-container";
    if (this.type === "circle") {
      this.element.classList.add("glass-container-circle");
    } else if (this.type === "pill") {
      this.element.classList.add("glass-container-pill");
    }
    this.element.style.borderRadius = `${this.borderRadius}px`;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "liquid-glass-instance-canvas";
    this.canvas.style.borderRadius = `${this.borderRadius}px`;
    this.canvas.style.position = "absolute";
    this.canvas.style.inset = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "none";
    this.canvas.style.zIndex = "-1";
    this.element.appendChild(this.canvas);

    GlassContainer.instances.push(this);
    this.updateSizeFromDOM();
  }

  addChild(child: GlassContainer) {
    this.children.push(child);
    child.parent = this;
    if (child.element && this.element) {
      this.element.appendChild(child.element);
    }
    if (child instanceof GlassButton) {
      child.setupAsNestedGlass();
    }
    this.updateSizeFromDOM();
    return child;
  }

  removeChild(child: GlassContainer) {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
      child.parent = null;
      if (child.element && this.element.contains(child.element)) {
        this.element.removeChild(child.element);
      }
      this.updateSizeFromDOM();
    }
  }

  updateSizeFromDOM() {
    if (typeof requestAnimationFrame === "undefined") return;
    requestAnimationFrame(() => {
      const rect = this.element.getBoundingClientRect();
      let newWidth = Math.max(1, Math.ceil(rect.width));
      let newHeight = Math.max(1, Math.ceil(rect.height));

      if (this.type === "circle") {
        const size = Math.max(newWidth, newHeight);
        newWidth = size;
        newHeight = size;
        this.borderRadius = size / 2;
        this.element.style.width = `${size}px`;
        this.element.style.height = `${size}px`;
        this.element.style.borderRadius = `${this.borderRadius}px`;
      } else if (this.type === "pill") {
        this.borderRadius = newHeight / 2;
        this.element.style.borderRadius = `${this.borderRadius}px`;
      }

      this.width = newWidth;
      this.height = newHeight;
      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      this.canvas.style.borderRadius = `${this.borderRadius}px`;
    });
  }
}

export class GlassButton extends GlassContainer {
  text: string;
  fontSize: number;
  onClick: ((text: string) => void) | null;
  textElement: HTMLDivElement;

  constructor(options: ButtonOptions = {}) {
    const fontSize = Number(options.size) || 24;
    super({
      borderRadius: options.borderRadius ?? fontSize,
      type: options.type ?? "rounded",
      tintOpacity: options.tintOpacity ?? 0.2,
      warp: options.warp ?? false,
    });
    this.text = options.text ?? "Button";
    this.fontSize = fontSize;
    this.onClick = options.onClick ?? null;

    this.element.classList.add("glass-button");
    if (this.type === "circle") {
      this.element.classList.add("glass-button-circle");
    }

    this.textElement = document.createElement("div");
    this.textElement.className = "glass-button-text";
    this.textElement.textContent = this.text;
    this.textElement.style.fontSize = `${this.fontSize}px`;
    this.element.appendChild(this.textElement);

    if (this.onClick) {
      this.element.addEventListener("click", (e) => {
        e.preventDefault();
        this.onClick?.(this.text);
      });
    }
    this.setSizeFromText();
  }

  setupAsNestedGlass() {
    if (this.parent) {
      this.isNestedGlass = true;
      this.element.dataset.nestedGlass = "true";
    }
  }

  setSizeFromText() {
    if (this.type === "circle") {
      const circleSize = Math.round(this.fontSize * 2.5);
      this.width = circleSize;
      this.height = circleSize;
      this.borderRadius = circleSize / 2;
      this.element.style.width = `${circleSize}px`;
      this.element.style.height = `${circleSize}px`;
    } else if (this.type === "pill") {
      const width = Math.ceil(this.text.length * this.fontSize * 0.6 + this.fontSize * 2);
      const height = Math.ceil(this.fontSize * 2.2);
      this.width = width;
      this.height = height;
      this.borderRadius = height / 2;
      this.element.style.minWidth = `${width}px`;
      this.element.style.minHeight = `${height}px`;
    } else {
      const width = Math.ceil(this.text.length * this.fontSize * 0.6 + this.fontSize * 2);
      const height = Math.ceil(this.fontSize * 2.5);
      this.width = width;
      this.height = height;
      this.borderRadius = this.fontSize;
      this.element.style.minWidth = `${width}px`;
      this.element.style.minHeight = `${height}px`;
    }
    this.element.style.borderRadius = `${this.borderRadius}px`;
    this.canvas.style.borderRadius = `${this.borderRadius}px`;
  }
}

function paintSourceBackdrop(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: "light-container" | "dark-container" | "circle",
) {
  ctx.clearRect(0, 0, w, h);
  if (mode === "dark-container") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#0b1913");
    g.addColorStop(0.45, "#10221b");
    g.addColorStop(1, "#080f0c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const o1 = ctx.createRadialGradient(w * 0.24, h * 0.25, 4, w * 0.24, h * 0.25, w * 0.48);
    o1.addColorStop(0, "rgba(36, 229, 160, 0.34)");
    o1.addColorStop(1, "rgba(36, 229, 160, 0)");
    ctx.fillStyle = o1;
    ctx.fillRect(0, 0, w, h);

    const o2 = ctx.createRadialGradient(w * 0.78, h * 0.22, 6, w * 0.78, h * 0.22, w * 0.42);
    o2.addColorStop(0, "rgba(213, 247, 165, 0.28)");
    o2.addColorStop(1, "rgba(213, 247, 165, 0)");
    ctx.fillStyle = o2;
    ctx.fillRect(0, 0, w, h);

    const o3 = ctx.createRadialGradient(w * 0.52, h * 0.84, 8, w * 0.52, h * 0.84, w * 0.46);
    o3.addColorStop(0, "rgba(26, 94, 68, 0.45)");
    o3.addColorStop(1, "rgba(16, 34, 27, 0)");
    ctx.fillStyle = o3;
    ctx.fillRect(0, 0, w, h);
  } else if (mode === "circle") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#122920");
    g.addColorStop(0.5, "#193a2d");
    g.addColorStop(1, "#0d1c16");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.32, h * 0.26, 2, w * 0.32, h * 0.26, w * 0.42);
    glow.addColorStop(0, "rgba(213, 247, 165, 0.55)");
    glow.addColorStop(0.55, "rgba(36, 229, 160, 0.24)");
    glow.addColorStop(1, "rgba(36, 229, 160, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#101a15");
    g.addColorStop(0.45, "#13241c");
    g.addColorStop(1, "#0c1410");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const topHighlight = ctx.createRadialGradient(w * 0.72, h * 0.16, 4, w * 0.72, h * 0.16, w * 0.46);
    topHighlight.addColorStop(0, "rgba(213, 247, 165, 0.32)");
    topHighlight.addColorStop(0.5, "rgba(36, 229, 160, 0.16)");
    topHighlight.addColorStop(1, "rgba(36, 229, 160, 0)");
    ctx.fillStyle = topHighlight;
    ctx.fillRect(0, 0, w, h);

    const bottomGlow = ctx.createRadialGradient(w * 0.24, h * 0.8, 6, w * 0.24, h * 0.8, w * 0.44);
    bottomGlow.addColorStop(0, "rgba(36, 229, 160, 0.26)");
    bottomGlow.addColorStop(1, "rgba(16, 34, 27, 0)");
    ctx.fillStyle = bottomGlow;
    ctx.fillRect(0, 0, w, h);
  }
}

function tagGlassDOM(root: ParentNode) {
  const containers = root.querySelectorAll<HTMLElement>(
    ".panel, .stat-card, .project-card, .upload-form, .empty, .sidebar-note, .glass-card, .topbar",
  );
  containers.forEach((el) => {
    el.classList.add("glass-container");
  });

  const pills = root.querySelectorAll<HTMLElement>(".glass-pill, .badge");
  pills.forEach((el) => {
    el.classList.add("glass-container", "glass-container-pill");
  });

  const circles = root.querySelectorAll<HTMLElement>(
    ".orbital-icon, .project-symbol, .milestone-number, .file-icon, .notification-icon, .empty-icon",
  );
  circles.forEach((el) => {
    el.classList.add("glass-container", "glass-container-circle");
  });

  const buttons = root.querySelectorAll<HTMLElement>(".button, .icon-button");
  buttons.forEach((el) => {
    el.classList.add("glass-button");
    if (el.classList.contains("icon-button")) {
      el.classList.add("glass-button-circle");
    }
    if (el.closest(".glass-container")) {
      el.dataset.nestedGlass = "true";
    }
  });
}

// Shared multi-layer WebGL refraction pipeline (Container + Nested Button Glass)
export function GlassButtons() {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const scope = ref.current?.parentElement ?? document.documentElement;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const previousContainer = window.Container;
    const previousButton = window.Button;
    const previousUpdate = window.updateAllGlassInstances;
    let updateAll: (() => void) | undefined;

    if (typeof window !== "undefined") {
      window.glassControls = {
        ...DEFAULT_GLASS_CONTROLS,
        ...(window.glassControls || {}),
      };
      window.Container = GlassContainer;
      window.Button = GlassButton;
    }

    tagGlassDOM(scope);
    const observer = new MutationObserver(() => tagGlassDOM(scope));
    observer.observe(scope, { childList: true, subtree: true });

    let cancelled = false;
    const controller = new AbortController();
    let disposeGL = () => {};

    async function initPipeline() {
      if (!canvas) return;
      const [vertSrc, containerFragSrc, nestedFragSrc] = await Promise.all([
        fetch("/effects/glass.vert", { signal: controller.signal }).then((r) =>
          r.ok ? r.text() : Promise.reject(new Error("glass.vert failed")),
        ),
        fetch("/effects/glass.frag", { signal: controller.signal }).then((r) =>
          r.ok ? r.text() : Promise.reject(new Error("glass.frag failed")),
        ),
        fetch("/effects/glass-nested.frag", { signal: controller.signal }).then(
          (r) =>
            r.ok
              ? r.text()
              : Promise.reject(new Error("glass-nested.frag failed")),
        ),
      ]);
      if (cancelled) return;

      const gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      if (!gl) return;

      const shaders: WebGLShader[] = [];
      const programs: WebGLProgram[] = [];
      const buffers: WebGLBuffer[] = [];
      const textures: WebGLTexture[] = [];
      let released = false;
      disposeGL = () => {
        if (released) return;
        released = true;
        buffers.forEach((buffer) => gl.deleteBuffer(buffer));
        textures.forEach((texture) => gl.deleteTexture(texture));
        programs.forEach((program) => gl.deleteProgram(program));
        shaders.forEach((shader) => gl.deleteShader(shader));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };

      const compileProgram = (vs: string, fs: string) => {
        const vShader = gl.createShader(gl.VERTEX_SHADER);
        if (!vShader) throw new Error("Glass shader unavailable");
        shaders.push(vShader);
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);
        if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) throw new Error("Glass shader unsupported");

        const fShader = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fShader) throw new Error("Glass shader unavailable");
        shaders.push(fShader);
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) throw new Error("Glass shader unsupported");

        const prog = gl.createProgram();
        if (!prog) throw new Error("Glass program unavailable");
        programs.push(prog);
        gl.attachShader(prog, vShader);
        gl.attachShader(prog, fShader);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("Glass program unsupported");
        return { prog, vShader, fShader };
      };

      const containerBundle = compileProgram(vertSrc, containerFragSrc);
      const nestedBundle = compileProgram(vertSrc, nestedFragSrc);
      if (!containerBundle || !nestedBundle) return;

      const posBuffer = gl.createBuffer();
      if (!posBuffer) throw new Error("Glass buffer unavailable");
      buffers.push(posBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const texBuffer = gl.createBuffer();
      if (!texBuffer) throw new Error("Glass buffer unavailable");
      buffers.push(texBuffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
        gl.STATIC_DRAW,
      );

      const tex = gl.createTexture();
      if (!tex) throw new Error("Glass texture unavailable");
      textures.push(tex);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = 512;
      sourceCanvas.height = 256;
      const sourceCtx = sourceCanvas.getContext("2d")!;

      const containerHoldCanvas = document.createElement("canvas");
      containerHoldCanvas.width = 320;
      containerHoldCanvas.height = 180;
      const containerHoldCtx = containerHoldCanvas.getContext("2d")!;

      const bindQuad = (prog: WebGLProgram) => {
        gl.useProgram(prog);
        const posLoc = gl.getAttribLocation(prog, "a_position");
        if (posLoc >= 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        }
        const texLoc = gl.getAttribLocation(prog, "a_texcoord");
        if (texLoc >= 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
          gl.enableVertexAttribArray(texLoc);
          gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
        }
      };

      const renderAll = () => {
        if (cancelled || released || gl.isContextLost() || document.hidden) return;
        const controls: GlassControlsConfig = {
          ...DEFAULT_GLASS_CONTROLS,
          ...(window.glassControls || {}),
        };

        const runPass = (
          prog: WebGLProgram,
          w: number,
          h: number,
          texSource: HTMLCanvasElement,
          uniforms: Record<string, number | [number, number]>,
        ) => {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          bindQuad(prog);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            texSource,
          );
          gl.uniform1i(gl.getUniformLocation(prog, "u_image"), 0);

          const baseUniforms: Record<string, number> = {
            scrollY: window.scrollY || 0,
            pageHeight: Math.max(
              document.body?.scrollHeight || 800,
              document.documentElement?.scrollHeight || 800,
            ),
            viewportHeight: window.innerHeight || 800,
            blurRadius: controls.blurRadius,
            edgeIntensity: controls.edgeIntensity,
            rimIntensity: controls.rimIntensity,
            baseIntensity: controls.baseIntensity,
            edgeDistance: controls.edgeDistance,
            rimDistance: controls.rimDistance,
            baseDistance: controls.baseDistance,
            cornerBoost: controls.cornerBoost,
            rippleEffect: controls.rippleEffect,
            tintOpacity: controls.tintOpacity,
          };

          for (const [k, v] of Object.entries(baseUniforms)) {
            const loc = gl.getUniformLocation(prog, `u_${k}`);
            if (loc) gl.uniform1f(loc, v);
          }
          for (const [k, v] of Object.entries(uniforms)) {
            const loc = gl.getUniformLocation(prog, `u_${k}`);
            if (!loc) continue;
            if (Array.isArray(v)) {
              gl.uniform2f(loc, v[0], v[1]);
            } else {
              gl.uniform1f(loc, v);
            }
          }
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          return canvas.toDataURL();
        };

        // Pass 1: Light Rounded Container Glass (glass.frag)
        paintSourceBackdrop(sourceCtx, 512, 256, "light-container");
        const containerUrl = runPass(containerBundle.prog, 320, 180, sourceCanvas, {
          resolution: [320, 180],
          textureSize: [512, 256],
          containerPosition: [256, 128],
          borderRadius: 14,
          warp: 0,
          tintOpacity: controls.tintOpacity,
        });
        containerHoldCtx.clearRect(0, 0, 320, 180);
        containerHoldCtx.drawImage(canvas, 0, 0);

        // Pass 2: Dark Rounded Container Glass (glass.frag)
        paintSourceBackdrop(sourceCtx, 512, 256, "dark-container");
        const darkContainerUrl = runPass(
          containerBundle.prog,
          320,
          180,
          sourceCanvas,
          {
            resolution: [320, 180],
            textureSize: [512, 256],
            containerPosition: [256, 128],
            borderRadius: 16,
            warp: 0,
            tintOpacity: Math.min(0.28, controls.tintOpacity),
          },
        );

        // Pass 3: Perfect Circle Glass (glass.frag -> isCircle)
        paintSourceBackdrop(sourceCtx, 512, 256, "circle");
        const circleUrl = runPass(containerBundle.prog, 120, 120, sourceCanvas, {
          resolution: [120, 120],
          textureSize: [512, 256],
          containerPosition: [256, 128],
          borderRadius: 60,
          warp: 1,
          tintOpacity: controls.tintOpacity,
        });

        // Pass 4: Nested Pill Button Glass (glass-nested.frag -> samples Pass 1 Container output!)
        const nestedButtonUrl = runPass(
          nestedBundle.prog,
          256,
          80,
          containerHoldCanvas,
          {
            resolution: [256, 80],
            textureSize: [320, 180],
            containerSize: [320, 180],
            containerPosition: [160, 90],
            buttonPosition: [160, 90],
            borderRadius: 40,
            warp: 1,
            blurRadius: Math.max(2.0, controls.blurRadius * 0.65),
            tintOpacity: controls.tintOpacity,
          },
        );

        const targets = [scope, document.documentElement];
        targets.forEach((t) => {
          t.style.setProperty(
            "--liquid-container-texture",
            `url("${containerUrl}")`,
          );
          t.style.setProperty(
            "--liquid-dark-container-texture",
            `url("${darkContainerUrl}")`,
          );
          t.style.setProperty(
            "--liquid-circle-texture",
            `url("${circleUrl}")`,
          );
          t.style.setProperty(
            "--liquid-button-texture",
            `url("${nestedButtonUrl}")`,
          );
          t.style.setProperty(
            "--liquid-nested-button-texture",
            `url("${nestedButtonUrl}")`,
          );
        });
        scope.dataset.glassReady = "true";

        // Also update any programmatic GlassContainer / GlassButton instances
        GlassContainer.instances.forEach((inst) => {
          const w = Math.max(1, inst.width || 160);
          const h = Math.max(1, inst.height || 64);
          const isNested = inst instanceof GlassButton && inst.isNestedGlass && inst.parent;
          const dataUrl = isNested
            ? runPass(nestedBundle.prog, w, h, inst.parent!.canvas, {
                resolution: [w, h],
                textureSize: [inst.parent!.width || 320, inst.parent!.height || 180],
                containerSize: [inst.parent!.width || 320, inst.parent!.height || 180],
                containerPosition: [
                  (inst.parent!.width || 320) / 2,
                  (inst.parent!.height || 180) / 2,
                ],
                buttonPosition: [
                  (inst.parent!.width || 320) / 2,
                  (inst.parent!.height || 180) / 2,
                ],
                borderRadius: inst.borderRadius,
                warp: inst.warp ? 1 : 0,
                tintOpacity: inst.tintOpacity,
              })
            : runPass(containerBundle.prog, w, h, sourceCanvas, {
                resolution: [w, h],
                textureSize: [512, 256],
                containerPosition: [256, 128],
                borderRadius: inst.borderRadius,
                warp: inst.warp ? 1 : 0,
                tintOpacity: inst.tintOpacity,
              });
          const ctx2d = inst.canvas.getContext("2d");
          if (ctx2d) {
            const img = new Image();
            img.onload = () => {
              ctx2d.clearRect(0, 0, inst.canvas.width, inst.canvas.height);
              ctx2d.drawImage(img, 0, 0, inst.canvas.width, inst.canvas.height);
            };
            img.src = dataUrl;
          }
        });
      };

      renderAll();

      updateAll = () => {
        renderAll();
        triggerAllGlassEffectsUpdate();
      };

      window.updateAllGlassInstances = updateAll;

    }

    initPipeline().catch(() => {
      disposeGL();
    });

    return () => {
      cancelled = true;
      controller.abort();
      observer.disconnect();
      disposeGL();
      if (window.updateAllGlassInstances === updateAll) window.updateAllGlassInstances = previousUpdate;
      if (window.Container === GlassContainer) window.Container = previousContainer;
      if (window.Button === GlassButton) window.Button = previousButton;
      [scope, document.documentElement].forEach((t) => {
        t.style.removeProperty("--liquid-container-texture");
        t.style.removeProperty("--liquid-dark-container-texture");
        t.style.removeProperty("--liquid-circle-texture");
        t.style.removeProperty("--liquid-button-texture");
        t.style.removeProperty("--liquid-nested-button-texture");
      });
      delete scope.dataset.glassReady;
    };
  }, []);

  return (
    <div ref={ref} className="glass-button-renderer" aria-hidden="true">
      <canvas ref={canvasRef} className="liquid-glass-shared" />
    </div>
  );
}
