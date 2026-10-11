"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CanvasLifecycle } from "./canvas-lifecycle";

interface InteractionState {
  pointerX: number;
  pointerY: number;
  focusLevel: number; // 0 = idle, 1 = email/input focus, 2 = password focus
  hoverBoost: number; // 0 = idle, 1 = CTA hover
  pulseSurge: number; // transient boost on submit/focus transition
  hidden: boolean;
}

/**
 * Custom GLSL shader for the Internal Faceted Emerald Crystal & Bioluminescent Chamber.
 * Rendered in the opaque pass so Three.js's physical transmission buffer refracts
 * and magnifies it through the outer Crowned Black Optical Glass Monolith.
 */
const CRYSTAL_CHAMBER_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vViewPosition;
  uniform float uTime;
  uniform float uFocus;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vLocalPos = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CRYSTAL_CHAMBER_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  varying vec3 vViewPosition;
  uniform float uTime;
  uniform float uFocus;
  uniform vec2 uPointer;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float ndotv = clamp(abs(dot(normal, viewDir)), 0.0, 1.0);
    float fresnel = pow(1.0 - ndotv, 1.75);

    // Studio facet lighting across the cut emerald crystal planes
    vec3 keyDir = normalize(vec3(-0.52 + uPointer.x * 0.25, 0.72 + uPointer.y * 0.25, 0.85));
    vec3 rimDir = normalize(vec3(0.68, -0.42, 0.58));
    float diffKey = max(dot(normal, keyDir), 0.0);
    float diffRim = max(dot(normal, rimDir), 0.0);
    float specKey = pow(max(dot(normal, normalize(keyDir + viewDir)), 0.0), 28.0);
    float specRim = pow(max(dot(normal, normalize(rimDir + viewDir)), 0.0), 16.0);

    // Internal laminar bioluminescent energy veins flowing vertically through the crystal
    float veinA = sin(vLocalPos.y * 8.0 - uTime * 1.4 + vLocalPos.x * 7.0 + uPointer.x * 0.9);
    float veinB = cos(vLocalPos.y * 5.5 + uTime * 0.95 - vLocalPos.z * 6.5 + uPointer.y * 0.9);
    float vein = smoothstep(0.22, 0.88, veinA * veinB * 0.5 + 0.5);

    // Concentrated vertical plasma filament down the central axis of the crystal
    float radialDist = length(vLocalPos.xz);
    float centralCore = smoothstep(0.16, 0.02, radialDist) * smoothstep(0.62, 0.08, abs(vLocalPos.y));
    float axialPulse = 0.82 + 0.18 * sin(vLocalPos.y * 5.0 - uTime * 2.1);

    vec3 darkObsidianEmerald = vec3(0.02, 0.09, 0.065);
    vec3 deepEmerald = vec3(0.045, 0.32, 0.21);
    vec3 brightEmerald = vec3(0.141, 0.898, 0.627); // #24E5A0
    vec3 warmLime = vec3(0.835, 0.969, 0.647);      // #D5F7A5

    float energyBoost = 0.95 + uFocus * 0.35;
    vec3 color = mix(darkObsidianEmerald, deepEmerald, 0.35 + diffKey * 0.45 + diffRim * 0.25);
    color = mix(color, brightEmerald, (vein * 0.58 + fresnel * 0.52 + centralCore * 0.65) * energyBoost);
    color = mix(color, warmLime, (centralCore * axialPulse * 0.72 + pow(vein, 2.2) * 0.38) * energyBoost);
    color += warmLime * (specKey * 0.85);
    color += brightEmerald * (specRim * 0.6);

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SEAM_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SEAM_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFocus;

  void main() {
    float phase = fract(vUv.x - uTime * (0.07 + uFocus * 0.035));
    float pulseA = smoothstep(0.0, 0.22, phase) * (1.0 - smoothstep(0.22, 0.38, phase));
    float pulseB = smoothstep(0.5, 0.72, phase) * (1.0 - smoothstep(0.72, 0.88, phase));
    float intensity = max(pulseA, pulseB * 0.75);

    vec3 baseSubtle = vec3(0.06, 0.28, 0.19);
    vec3 emerald = vec3(0.141, 0.898, 0.627);
    vec3 lime = vec3(0.835, 0.969, 0.647);

    vec3 col = mix(baseSubtle, emerald, 0.45 + intensity * (0.55 + uFocus * 0.2));
    col = mix(col, lime, pow(intensity, 2.0) * 0.75);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const initialInteraction: InteractionState = {
  pointerX: 0,
  pointerY: 0,
  focusLevel: 0,
  hoverBoost: 0,
  pulseSurge: 0,
  hidden: false,
};

const interactionState: InteractionState = { ...initialInteraction };

/**
 * Generates a high-contrast dark luxury product studio environment map via PMREMGenerator.
 * Combines a dark obsidian studio dome with crisp neutral platinum key softboxes (for
 * authentic dark brushed titanium reflections) and a single emerald rim strip light.
 */
function createStudioEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  const pmremGenerator = new THREE.PMREMGenerator(gl);
  pmremGenerator.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color("#030605");

  const domeGeo = new THREE.SphereGeometry(14, 32, 24);
  const posAttr = domeGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const cTop = new THREE.Color("#111917");
  const cHorizon = new THREE.Color("#070c0a");
  const cBottom = new THREE.Color("#020403");
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const ny = posAttr.getY(i) / 14;
    if (ny >= 0) {
      tmpColor.copy(cHorizon).lerp(cTop, Math.pow(ny, 0.85));
    } else {
      tmpColor.copy(cHorizon).lerp(cBottom, Math.pow(-ny, 0.85));
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  domeGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const domeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  const panelGeo = new THREE.PlaneGeometry(1, 1);

  // 1. Primary Key Softbox Bank (top-left front — crisp studio platinum white)
  const keyMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#f2f7f5"),
    side: THREE.DoubleSide,
  });
  const keyPanel = new THREE.Mesh(panelGeo, keyMat);
  keyPanel.position.set(-4.2, 4.8, 4.6);
  keyPanel.scale.set(5.2, 3.4, 1);
  keyPanel.lookAt(0, 0, 0);
  envScene.add(keyPanel);

  // 2. Vertical Architectural Strip Light (left flank — cool silver-slate)
  const sideMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#b8c9c3"),
    side: THREE.DoubleSide,
  });
  const sidePanel = new THREE.Mesh(panelGeo, sideMat);
  sidePanel.position.set(-6.0, 0.4, 2.8);
  sidePanel.scale.set(1.8, 7.5, 1);
  sidePanel.lookAt(0, 0, 0);
  envScene.add(sidePanel);

  // 3. Emerald Rim Softbox Bank (right-rear grazing — signature emerald rim reflection)
  const rimMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#10b981"),
    side: THREE.DoubleSide,
  });
  const rimPanel = new THREE.Mesh(panelGeo, rimMat);
  rimPanel.position.set(5.6, -1.4, 2.6);
  rimPanel.scale.set(3.2, 7.2, 1);
  rimPanel.lookAt(0, 0, 0);
  envScene.add(rimPanel);

  // 4. Overhead Crown Reflector (cool titanium highlight)
  const crownMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#dce8e3"),
    side: THREE.DoubleSide,
  });
  const crownPanel = new THREE.Mesh(panelGeo, crownMat);
  crownPanel.position.set(2.2, 6.4, 1.8);
  crownPanel.scale.set(4.4, 2.4, 1);
  crownPanel.lookAt(0, 0, 0);
  envScene.add(crownPanel);

  // 5. Subtle Lower Studio Bounce Card
  const fillMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#162821"),
    side: THREE.DoubleSide,
  });
  const fillPanel = new THREE.Mesh(panelGeo, fillMat);
  fillPanel.position.set(0, -6.2, 2.2);
  fillPanel.scale.set(6.5, 3.8, 1);
  fillPanel.lookAt(0, 0, 0);
  envScene.add(fillPanel);

  const renderTarget = pmremGenerator.fromScene(envScene, 0.03);

  domeGeo.dispose();
  domeMat.dispose();
  panelGeo.dispose();
  keyMat.dispose();
  sideMat.dispose();
  rimMat.dispose();
  crownMat.dispose();
  fillMat.dispose();
  pmremGenerator.dispose();

  return renderTarget.texture;
}

/**
 * Base 10-vertex crowned octagonal cross-section in the XZ plane (counter-clockwise).
 * Features a central front/back vertical prism ridge (z = ±0.34) and 45-degree corner
 * chamfers so adjacent crystal facets have distinct 3D surface normals.
 */
const MONOLITH_RING_TEMPLATE: [number, number][] = [
  [0.0, 0.34], // 0: Front central vertical ridge
  [0.32, 0.24], // 1: Front-right facet shoulder
  [0.45, 0.1], // 2: Right-front chamfer edge
  [0.45, -0.1], // 3: Right-back chamfer edge
  [0.32, -0.24], // 4: Back-right facet shoulder
  [0.0, -0.34], // 5: Back central vertical ridge
  [-0.32, -0.24], // 6: Back-left facet shoulder
  [-0.45, -0.1], // 7: Left-back chamfer edge
  [-0.45, 0.1], // 8: Left-front chamfer edge
  [-0.32, 0.24], // 9: Front-left facet shoulder
];

interface LoftedSlice {
  y: number;
  sx: number;
  sz: number;
}

/**
 * Lofts a faceted 3D prism from horizontal cross-section slices with crisp facet normals and UVs.
 */
function buildLoftedPrismGeometry(slices: LoftedSlice[]): THREE.BufferGeometry {
  const ringLen = MONOLITH_RING_TEMPLATE.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const minY = slices[0].y;
  const maxY = slices[slices.length - 1].y;
  const heightSpan = Math.max(0.001, maxY - minY);

  const getVertex = (sliceIdx: number, ptIdx: number): [number, number, number] => {
    const s = slices[sliceIdx];
    const [bx, bz] = MONOLITH_RING_TEMPLATE[ptIdx % ringLen];
    return [bx * s.sx, s.y, bz * s.sz];
  };

  const pushTri = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    uvA: [number, number],
    uvB: [number, number],
    uvC: [number, number],
  ) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
  };

  // Side facets between consecutive horizontal slices
  for (let i = 0; i < slices.length - 1; i++) {
    const v0 = (slices[i].y - minY) / heightSpan;
    const v1 = (slices[i + 1].y - minY) / heightSpan;
    for (let j = 0; j < ringLen; j++) {
      const nextJ = (j + 1) % ringLen;
      const u0 = j / ringLen;
      const u1 = (j + 1) / ringLen;
      const p00 = getVertex(i, j);
      const p10 = getVertex(i, nextJ);
      const p11 = getVertex(i + 1, nextJ);
      const p01 = getVertex(i + 1, j);
      pushTri(p00, p10, p11, [u0, v0], [u1, v0], [u1, v1]);
      pushTri(p00, p11, p01, [u0, v0], [u1, v1], [u0, v1]);
    }
  }

  // Bottom cap (fan from center of slice 0)
  const bottomCenter: [number, number, number] = [0, slices[0].y, 0];
  for (let j = 0; j < ringLen; j++) {
    const p0 = getVertex(0, (j + 1) % ringLen);
    const p1 = getVertex(0, j);
    pushTri(bottomCenter, p0, p1, [0.5, 0.5], [1, 0], [0, 0]);
  }

  // Top cap (fan from center of last slice)
  const lastIdx = slices.length - 1;
  const topCenter: [number, number, number] = [0, slices[lastIdx].y, 0];
  for (let j = 0; j < ringLen; j++) {
    const p0 = getVertex(lastIdx, j);
    const p1 = getVertex(lastIdx, (j + 1) % ringLen);
    pushTri(topCenter, p0, p1, [0.5, 0.5], [0, 1], [1, 1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Helper to create a 2D chamfered rectangular/octagonal profile shape.
 */
function createChamferedRectShape(width: number, height: number, chamfer: number): THREE.Shape {
  const hw = width / 2;
  const hh = height / 2;
  const c = Math.min(chamfer, hw * 0.45, hh * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hh);
  shape.lineTo(hw - c, -hh);
  shape.lineTo(hw, -hh + c);
  shape.lineTo(hw, hh - c);
  shape.lineTo(hw - c, hh);
  shape.lineTo(-hw + c, hh);
  shape.lineTo(-hw, hh - c);
  shape.lineTo(-hw, -hh + c);
  shape.closePath();
  return shape;
}

/**
 * Helper to create a machined beveled ring cross-section for LatheGeometry.
 */
function createBeveledRingPoints(
  innerR: number,
  outerR: number,
  halfHeight: number,
  chamfer: number,
): THREE.Vector2[] {
  const c = Math.min(chamfer, (outerR - innerR) * 0.3, halfHeight * 0.4);
  return [
    new THREE.Vector2(innerR + c, -halfHeight),
    new THREE.Vector2(outerR - c, -halfHeight),
    new THREE.Vector2(outerR, -halfHeight + c),
    new THREE.Vector2(outerR, halfHeight - c),
    new THREE.Vector2(outerR - c, halfHeight),
    new THREE.Vector2(innerR + c, halfHeight),
    new THREE.Vector2(innerR, halfHeight - c),
    new THREE.Vector2(innerR, -halfHeight + c),
    new THREE.Vector2(innerR + c, -halfHeight),
  ];
}

function KineticSculpture({ compact }: { compact: boolean }) {
  const gl = useThree((state) => state.gl);
  const viewport = useThree((state) => state.viewport);

  const rootGroup = useRef<THREE.Group>(null);
  const monolithGroupRef = useRef<THREE.Group>(null);
  const crystalGroupRef = useRef<THREE.Group>(null);
  const primaryOrbitRef = useRef<THREE.Group>(null);
  const secondaryArcRef = useRef<THREE.Group>(null);
  const internalLightRef = useRef<THREE.PointLight>(null);

  const chamberMatRef = useRef<THREE.ShaderMaterial>(null);
  const seamMatRef = useRef<THREE.ShaderMaterial>(null);

  const smoothState = useRef({
    px: 0,
    py: 0,
    focus: 0,
  });

  const envMap = useMemo(() => createStudioEnvironment(gl), [gl]);

  useEffect(() => {
    return () => {
      envMap.dispose();
    };
  }, [envMap]);

  const chamberUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFocus: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
    }),
    [],
  );

  const seamUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFocus: { value: 0 },
    }),
    [],
  );

  // Precision Procedural Geometries
  const geometries = useMemo(() => {
    // 1A. Outer Monolith — Crowned Multi-Faceted Black Optical Glass Obelisk
    // Straight, unbroken vertical prism faces between y = -0.68 and y = +0.68 with
    // precision 45° top/bottom crown bevels.
    const monolithGlassGeo = buildLoftedPrismGeometry([
      { y: -0.84, sx: 0.64, sz: 0.64 },
      { y: -0.76, sx: 0.86, sz: 0.86 },
      { y: -0.66, sx: 0.96, sz: 0.96 },
      { y: 0.66, sx: 0.96, sz: 0.96 },
      { y: 0.76, sx: 0.86, sz: 0.86 },
      { y: 0.84, sx: 0.64, sz: 0.64 },
    ]);

    // 1B. Precision-Machined Titanium Crown & Base End-Caps (matched to monolith profile)
    const crownCapGeo = buildLoftedPrismGeometry([
      { y: 0.76, sx: 0.88, sz: 0.88 },
      { y: 0.82, sx: 0.9, sz: 0.9 },
      { y: 0.9, sx: 0.74, sz: 0.74 },
      { y: 0.95, sx: 0.54, sz: 0.54 },
    ]);

    const baseCapGeo = buildLoftedPrismGeometry([
      { y: -0.95, sx: 0.54, sz: 0.54 },
      { y: -0.9, sx: 0.74, sz: 0.74 },
      { y: -0.82, sx: 0.9, sz: 0.9 },
      { y: -0.76, sx: 0.88, sz: 0.88 },
    ]);

    // 1C. Lateral Titanium Structural Clamps (left & right spines of the monolith)
    const spineShape = createChamferedRectShape(0.08, 0.92, 0.024);
    const spineGeo = new THREE.ExtrudeGeometry(spineShape, {
      depth: 0.24,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.018,
      bevelSegments: 3,
    });
    spineGeo.center();
    spineGeo.computeVertexNormals();

    // 2A. Internal Faceted Emerald Crystal Resonator (8-sided gem-cut bipyramid column)
    // Sized so there is a clear peripheral margin of dark smoked obsidian glass around it.
    const crystalPoints = [
      new THREE.Vector2(0.001, -0.62),
      new THREE.Vector2(0.17, -0.44),
      new THREE.Vector2(0.22, -0.18),
      new THREE.Vector2(0.22, 0.18),
      new THREE.Vector2(0.17, 0.44),
      new THREE.Vector2(0.001, 0.62),
    ];
    const innerCrystalRaw = new THREE.LatheGeometry(crystalPoints, 8);
    const innerCrystalGeo = innerCrystalRaw.toNonIndexed();
    innerCrystalRaw.dispose();
    innerCrystalGeo.computeVertexNormals();

    // 2B. Internal Titanium Emitter Sockets (positioned at the top & bottom of the crystal chamber)
    const collarPoints = createBeveledRingPoints(0.16, 0.28, 0.036, 0.009);
    const collarGeo = new THREE.LatheGeometry(collarPoints, 48);
    collarGeo.computeVertexNormals();

    // 3A. Primary Dominant Orbital Mechanism — Machined Titanium Gimbal Ring
    const orbitProfile = createBeveledRingPoints(1.46, 1.65, 0.055, 0.018);
    const primaryOrbitGeo = new THREE.LatheGeometry(orbitProfile, compact ? 96 : 128);
    primaryOrbitGeo.rotateX(Math.PI / 2);
    primaryOrbitGeo.computeVertexNormals();

    // 3B. Recessed Inner Emerald Optical Seam on the Primary Gimbal
    const orbitSeamGeo = new THREE.TorusGeometry(1.455, 0.011, 12, compact ? 96 : 128);

    // 3C. Machined Titanium Trunnion Mounts on the Primary Gimbal
    const mountShape = createChamferedRectShape(0.15, 0.25, 0.038);
    const mountGeo = new THREE.ExtrudeGeometry(mountShape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelThickness: 0.022,
      bevelSize: 0.022,
      bevelSegments: 3,
    });
    mountGeo.center();
    mountGeo.computeVertexNormals();

    // 4. Secondary Asymmetric 210° Titanium Counter-Arc
    const arcProfile = createBeveledRingPoints(1.2, 1.3, 0.034, 0.011);
    const secondaryArcGeo = new THREE.LatheGeometry(
      arcProfile,
      compact ? 64 : 88,
      0,
      Math.PI * 1.18,
    );
    secondaryArcGeo.rotateX(Math.PI / 2);
    secondaryArcGeo.computeVertexNormals();

    return {
      monolithGlassGeo,
      crownCapGeo,
      baseCapGeo,
      spineGeo,
      innerCrystalGeo,
      collarGeo,
      primaryOrbitGeo,
      orbitSeamGeo,
      mountGeo,
      secondaryArcGeo,
    };
  }, [compact]);

  useEffect(() => {
    return () => {
      geometries.monolithGlassGeo.dispose();
      geometries.crownCapGeo.dispose();
      geometries.baseCapGeo.dispose();
      geometries.spineGeo.dispose();
      geometries.innerCrystalGeo.dispose();
      geometries.collarGeo.dispose();
      geometries.primaryOrbitGeo.dispose();
      geometries.orbitSeamGeo.dispose();
      geometries.mountGeo.dispose();
      geometries.secondaryArcGeo.dispose();
    };
  }, [geometries]);

  useFrame((state, rawDelta) => {
    if (interactionState.hidden) return;
    const delta = Math.min(rawDelta, 0.05);
    const elapsed = state.clock.getElapsedTime();

    const targetFocus =
      interactionState.focusLevel * 0.42 +
      interactionState.hoverBoost * 0.3 +
      interactionState.pulseSurge;

    interactionState.pulseSurge = THREE.MathUtils.damp(
      interactionState.pulseSurge,
      0,
      2.8,
      delta,
    );

    smoothState.current.px = THREE.MathUtils.damp(
      smoothState.current.px,
      interactionState.pointerX,
      3.2,
      delta,
    );
    smoothState.current.py = THREE.MathUtils.damp(
      smoothState.current.py,
      interactionState.pointerY,
      3.2,
      delta,
    );
    smoothState.current.focus = THREE.MathUtils.damp(
      smoothState.current.focus,
      targetFocus,
      3.0,
      delta,
    );

    const { px, py, focus } = smoothState.current;

    if (chamberMatRef.current) {
      chamberMatRef.current.uniforms.uTime.value = elapsed;
      chamberMatRef.current.uniforms.uFocus.value = focus;
      chamberMatRef.current.uniforms.uPointer.value.set(px, py);
    }

    if (seamMatRef.current) {
      seamMatRef.current.uniforms.uTime.value = elapsed;
      seamMatRef.current.uniforms.uFocus.value = focus;
    }

    if (internalLightRef.current) {
      internalLightRef.current.intensity =
        3.6 + Math.sin(elapsed * 1.6) * 0.4 + focus * 1.5;
    }

    // Restrained, expensive-feeling orientation & floating motion
    if (rootGroup.current) {
      const targetRotY = px * 0.22 + Math.sin(elapsed * 0.25) * 0.06;
      const targetRotX = -py * 0.16 + Math.cos(elapsed * 0.2) * 0.04 + focus * 0.06;
      rootGroup.current.rotation.y = THREE.MathUtils.damp(
        rootGroup.current.rotation.y,
        targetRotY,
        3.2,
        delta,
      );
      rootGroup.current.rotation.x = THREE.MathUtils.damp(
        rootGroup.current.rotation.x,
        targetRotX,
        3.2,
        delta,
      );
      const basePosY = compact ? -0.02 : viewport.height * 0.205;
      const compactXRatio = viewport.width < 4.6 ? 0.285 : 0.25;
      rootGroup.current.position.x = compact
        ? viewport.width * compactXRatio
        : viewport.width * 0.135;
      rootGroup.current.position.y = basePosY + Math.sin(elapsed * 0.75) * 0.035;
    }

    // Central Monolith: slow, deliberate architectural rotation
    if (monolithGroupRef.current) {
      const targetMonolithY =
        -0.28 + elapsed * 0.1 + px * 0.12 + focus * 0.16;
      monolithGroupRef.current.rotation.y = THREE.MathUtils.damp(
        monolithGroupRef.current.rotation.y,
        targetMonolithY,
        2.8,
        delta,
      );
      monolithGroupRef.current.rotation.z = THREE.MathUtils.damp(
        monolithGroupRef.current.rotation.z,
        0.05 + py * 0.04,
        2.8,
        delta,
      );
    }

    // Internal Crystal Resonator: gentle counter-rotation inside the chamber
    if (crystalGroupRef.current) {
      crystalGroupRef.current.rotation.y = -elapsed * 0.22;
      const pulseScale = 1 + Math.sin(elapsed * 1.8) * 0.025 + focus * 0.04;
      crystalGroupRef.current.scale.set(1, pulseScale, 1);
    }

    // Primary Titanium Gimbal: smooth gyroscopic rotation + focus alignment
    if (primaryOrbitRef.current) {
      primaryOrbitRef.current.rotation.z += delta * (0.14 + focus * 0.08);
      primaryOrbitRef.current.rotation.x = THREE.MathUtils.damp(
        primaryOrbitRef.current.rotation.x,
        0.62 - focus * 0.14 + py * 0.08,
        2.8,
        delta,
      );
      primaryOrbitRef.current.rotation.y = THREE.MathUtils.damp(
        primaryOrbitRef.current.rotation.y,
        -0.34 + focus * 0.1 + px * 0.08,
        2.8,
        delta,
      );
    }

    // Secondary Asymmetric Counter-Arc: slow mechanical counter-sweep
    if (secondaryArcRef.current) {
      secondaryArcRef.current.rotation.z -= delta * (0.09 + focus * 0.05);
      secondaryArcRef.current.rotation.x = THREE.MathUtils.damp(
        secondaryArcRef.current.rotation.x,
        -0.54 + focus * 0.12 - py * 0.06,
        2.6,
        delta,
      );
    }
  });

  const baseScale = compact
    ? Math.min(0.74, viewport.width * 0.142, viewport.height * 0.2)
    : Math.min(0.65, Math.min(viewport.width, viewport.height) * 0.192);
  const initialX = compact
    ? viewport.width * (viewport.width < 4.6 ? 0.285 : 0.25)
    : viewport.width * 0.135;
  const initialY = compact ? -0.02 : viewport.height * 0.205;

  return (
    <group ref={rootGroup} scale={baseScale} position={[initialX, initialY, 0]}>
      {/* Cinematic 3-Point Studio Lighting */}
      <ambientLight intensity={0.5} color="#101815" />
      {/* Soft Directional Key Light (top-left front — clean studio platinum white) */}
      <directionalLight position={[-4.8, 6.2, 5.2]} intensity={3.2} color="#f4f8f6" />
      {/* Cool Titanium Fill Light (left-front) */}
      <directionalLight position={[-3.2, -1.5, 4.0]} intensity={1.1} color="#9ab0a8" />
      {/* Emerald Rim Light (right-rear grazing) */}
      <directionalLight position={[5.2, -3.2, 2.2]} intensity={2.4} color="#10b981" />
      {/* Internal Chamber Point Light */}
      <pointLight
        ref={internalLightRef}
        position={[0, 0, 0]}
        intensity={3.6}
        distance={4.2}
        decay={1.5}
        color="#24e5a0"
      />

      {/* ==================================================================
          PART 1 & 2 — THE CENTRAL MONOLITH & INTERNAL ENERGY CHAMBER
         ================================================================== */}
      <group ref={monolithGroupRef} rotation={[0.08, -0.28, 0.05]}>
        {/* 2A. Faceted Emerald Crystal & Bioluminescent Energy Chamber */}
        <group ref={crystalGroupRef}>
          <mesh geometry={geometries.innerCrystalGeo}>
            <shaderMaterial
              ref={chamberMatRef}
              vertexShader={CRYSTAL_CHAMBER_VERTEX_SHADER}
              fragmentShader={CRYSTAL_CHAMBER_FRAGMENT_SHADER}
              uniforms={chamberUniforms}
            />
          </mesh>
        </group>

        {/* 2B. Internal Machined Titanium Emitter Sockets (top & bottom of chamber) */}
        <mesh geometry={geometries.collarGeo} position={[0, 0.56, 0]}>
          <meshPhysicalMaterial
            color="#73807c"
            metalness={0.88}
            roughness={0.2}
            clearcoat={0.35}
            envMap={envMap}
            envMapIntensity={2.2}
          />
        </mesh>
        <mesh geometry={geometries.collarGeo} position={[0, -0.56, 0]}>
          <meshPhysicalMaterial
            color="#73807c"
            metalness={0.88}
            roughness={0.2}
            clearcoat={0.35}
            envMap={envMap}
            envMapIntensity={2.2}
          />
        </mesh>

        {/* 1A. Outer Crowned Multi-Faceted Black Optical Glass Monolith
            Uses physical transmission with dark obsidian-emerald Beer's Law attenuation
            so the internal emerald crystal chamber refracts vividly inside a smoked glass prism. */}
        <mesh geometry={geometries.monolithGlassGeo}>
          <meshPhysicalMaterial
            color="#ccebe0"
            emissive="#030d09"
            emissiveIntensity={0.12}
            metalness={0.0}
            roughness={0.04}
            transmission={0.93}
            ior={1.48}
            thickness={0.48}
            attenuationColor="#07281c"
            attenuationDistance={0.88}
            clearcoat={1.0}
            clearcoatRoughness={0.03}
            reflectivity={0.96}
            envMap={envMap}
            envMapIntensity={2.0}
          />
        </mesh>

        {/* 1B. Precision-Machined Dark Titanium Crown & Base Caps */}
        <mesh geometry={geometries.crownCapGeo}>
          <meshPhysicalMaterial
            color="#788581"
            metalness={0.88}
            roughness={0.21}
            clearcoat={0.35}
            clearcoatRoughness={0.16}
            envMap={envMap}
            envMapIntensity={2.2}
          />
        </mesh>
        <mesh geometry={geometries.baseCapGeo}>
          <meshPhysicalMaterial
            color="#788581"
            metalness={0.88}
            roughness={0.21}
            clearcoat={0.35}
            clearcoatRoughness={0.16}
            envMap={envMap}
            envMapIntensity={2.2}
          />
        </mesh>

        {/* 1C. Lateral Titanium Structural Spine Clamps */}
        <mesh geometry={geometries.spineGeo} position={[-0.45, 0, 0]}>
          <meshPhysicalMaterial
            color="#7e8c87"
            metalness={0.89}
            roughness={0.19}
            clearcoat={0.38}
            envMap={envMap}
            envMapIntensity={2.3}
          />
        </mesh>
        <mesh geometry={geometries.spineGeo} position={[0.45, 0, 0]}>
          <meshPhysicalMaterial
            color="#7e8c87"
            metalness={0.89}
            roughness={0.19}
            clearcoat={0.38}
            envMap={envMap}
            envMapIntensity={2.3}
          />
        </mesh>
      </group>

      {/* ==================================================================
          PART 3 — PRECISION ORBITAL STRUCTURE (DOMINANT TITANIUM GIMBAL)
         ================================================================== */}
      <group ref={primaryOrbitRef} rotation={[0.62, -0.34, 0.18]}>
        {/* Dominant Chamfered Brushed Titanium Ring */}
        <mesh geometry={geometries.primaryOrbitGeo}>
          <meshPhysicalMaterial
            color="#788682"
            metalness={0.88}
            roughness={0.2}
            clearcoat={0.38}
            clearcoatRoughness={0.15}
            envMap={envMap}
            envMapIntensity={2.3}
          />
        </mesh>

        {/* Recessed Inner Emerald Optical Seam */}
        <mesh geometry={geometries.orbitSeamGeo}>
          <shaderMaterial
            ref={seamMatRef}
            vertexShader={SEAM_VERTEX_SHADER}
            fragmentShader={SEAM_FRAGMENT_SHADER}
            uniforms={seamUniforms}
          />
        </mesh>

        {/* Opposed Machined Titanium Trunnion Clamps */}
        <mesh
          geometry={geometries.mountGeo}
          position={[1.555, 0, 0]}
          rotation={[0, 0, 0]}
        >
          <meshPhysicalMaterial
            color="#889692"
            metalness={0.9}
            roughness={0.17}
            clearcoat={0.42}
            envMap={envMap}
            envMapIntensity={2.4}
          />
        </mesh>
        <mesh
          geometry={geometries.mountGeo}
          position={[-1.555, 0, 0]}
          rotation={[0, 0, Math.PI]}
        >
          <meshPhysicalMaterial
            color="#889692"
            metalness={0.9}
            roughness={0.17}
            clearcoat={0.42}
            envMap={envMap}
            envMapIntensity={2.4}
          />
        </mesh>
      </group>

      {/* Secondary Asymmetric 210° Titanium Counter-Arc */}
      <group ref={secondaryArcRef} rotation={[-0.54, 0.42, -0.45]}>
        <mesh geometry={geometries.secondaryArcGeo}>
          <meshPhysicalMaterial
            color="#687571"
            metalness={0.88}
            roughness={0.24}
            clearcoat={0.32}
            envMap={envMap}
            envMapIntensity={2.0}
          />
        </mesh>
      </group>
    </group>
  );
}

export default function AiquorCore({ onUnavailable }: { onUnavailable: () => void }) {
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 800px)");
    const updateViewport = () => setCompact(mq.matches);
    updateViewport();
    Object.assign(interactionState, initialInteraction, { hidden: document.hidden });
    mq.addEventListener("change", updateViewport);

    const onPointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = -((e.clientY / Math.max(1, window.innerHeight)) * 2 - 1);
      interactionState.pointerX = nx;
      interactionState.pointerY = ny;

      document.documentElement.style.setProperty(
        "--auth-pointer-x",
        `${((e.clientX / Math.max(1, window.innerWidth)) * 100).toFixed(1)}%`,
      );
      document.documentElement.style.setProperty(
        "--auth-pointer-y",
        `${((e.clientY / Math.max(1, window.innerHeight)) * 100).toFixed(1)}%`,
      );
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target instanceof HTMLInputElement) {
        interactionState.focusLevel = target.type === "password" ? 2 : 1;
        interactionState.pulseSurge = 0.35;
      } else if (target.closest(".auth-form-content")) {
        interactionState.focusLevel = 1;
      }
    };

    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !related.closest(".auth-form-content")) {
        interactionState.focusLevel = 0;
      }
    };

    const onMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".auth-form-content .button")) {
        interactionState.hoverBoost = 1;
      }
    };

    const onMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".auth-form-content .button")) {
        interactionState.hoverBoost = 0;
      }
    };

    const onSubmit = () => {
      interactionState.pulseSurge = 0.75;
    };

    const onVisibilityChange = () => {
      interactionState.hidden = document.visibilityState === "hidden";
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("mouseover", onMouseOver, { passive: true });
    document.addEventListener("mouseout", onMouseOut, { passive: true });
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mq.removeEventListener("change", updateViewport);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.documentElement.style.removeProperty("--auth-pointer-x");
      document.documentElement.style.removeProperty("--auth-pointer-y");
    };
  }, []);

  return (
    <div
      className="aiquor-core-stage"
      data-testid="aiquor-core-stage"
      data-ready={ready ? "true" : "false"}
    >
      <Canvas
        onCreated={() => setReady(true)}
        dpr={compact ? [1, 1.25] : [1, 1.75]}
        camera={{ position: [0, 0, 5.2], fov: 40 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
        }}
      >
        <CanvasLifecycle onUnavailable={onUnavailable} />
        <KineticSculpture compact={compact} />
      </Canvas>
    </div>
  );
}
