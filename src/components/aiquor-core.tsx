"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
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

const CORE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  uniform float uTime;
  uniform float uFocus;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 displaced = position;
    float pulse = sin(position.x * 4.5 + uTime * 2.2) *
                  cos(position.y * 4.5 - uTime * 1.8) *
                  sin(position.z * 4.5 + uTime * 1.5);
    displaced += normal * pulse * (0.04 + uFocus * 0.03);
    vPosition = displaced;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CORE_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  uniform float uTime;
  uniform float uFocus;
  uniform vec2 uPointer;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.1);

    // Internal flowing energy veins across the singularity
    float wave1 = sin(vPosition.x * 7.5 + vPosition.y * 5.5 + uTime * 2.2 + uPointer.x * 1.8);
    float wave2 = cos(vPosition.z * 8.0 - vPosition.y * 6.0 - uTime * 1.8 + uPointer.y * 1.8);
    float wave3 = sin((vPosition.x - vPosition.z) * 6.0 + uTime * 2.6);
    float vein = smoothstep(0.18, 0.88, (wave1 * wave2 + wave3 * 0.35) * 0.5 + 0.5);

    vec3 deepForest = vec3(0.03, 0.13, 0.09);
    vec3 emerald = vec3(0.141, 0.898, 0.627); // #24E5A0
    vec3 lime = vec3(0.835, 0.969, 0.647);    // #D5F7A5

    vec3 color = mix(deepForest, emerald, 0.38 + vein * (0.58 + uFocus * 0.22));
    color = mix(color, lime, pow(vein, 2.6) * 0.55 + fresnel * (0.76 + uFocus * 0.2));

    float alpha = 0.88 + fresnel * 0.12;
    gl_FragColor = vec4(color, alpha);
  }
`;

const GLASS_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const GLASS_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vLocalPosition;
  uniform float uTime;
  uniform float uFocus;
  uniform vec2 uPointer;
  uniform float uShellLayer;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Double-sided normal alignment for crystal facets
    if (!gl_FrontFacing) {
      normal = -normal;
    }

    float ndotv = clamp( abs(dot(normal, viewDir)), 0.0, 1.0 );
    float fresnel = pow(1.0 - ndotv, 2.6);

    // Virtual studio area lights for controlled obsidian crystal reflections
    vec3 keyLightDir = normalize(vec3(-0.6 + uPointer.x * 0.35, 0.75 + uPointer.y * 0.3, 0.85));
    vec3 rimLightDir = normalize(vec3(0.7, -0.65, 0.45));

    vec3 halfKey = normalize(keyLightDir + viewDir);
    vec3 halfRim = normalize(rimLightDir + viewDir);

    float specKey = pow(max(dot(normal, halfKey), 0.0), 42.0);
    float specRim = pow(max(dot(normal, halfRim), 0.0), 24.0);

    // Internal subsurface caustics & emerald energy refraction through the glass
    float causticWave = sin(vLocalPosition.x * 5.2 - vLocalPosition.y * 4.4 + uTime * 1.9) *
                        cos(vLocalPosition.z * 5.6 + uTime * 1.5);
    float caustic = smoothstep(0.25, 0.95, causticWave * 0.5 + 0.5);

    vec3 obsidianBase = vec3(0.024, 0.055, 0.043); // #060E0B
    vec3 forestTint = vec3(0.063, 0.165, 0.125);   // #102A20
    vec3 emerald = vec3(0.141, 0.898, 0.627);      // #24E5A0
    vec3 lime = vec3(0.835, 0.969, 0.647);         // #D5F7A5

    vec3 color = mix(obsidianBase, forestTint, 0.45 + caustic * 0.35);
    color += emerald * (caustic * (0.24 + uFocus * 0.16) * uShellLayer);
    color = mix(color, emerald, fresnel * (0.58 + uFocus * 0.2));
    color += lime * (specKey * 0.52 + fresnel * 0.22);
    color += emerald * (specRim * 0.36);

    // Translucent center so the inner singularity & energy veins shine through clearly,
    // with denser refractive edge thickness at grazing angles
    float baseAlpha = mix(0.16, 0.24, uShellLayer);
    float alpha = clamp(baseAlpha + fresnel * 0.52 + specKey * 0.35 + caustic * 0.08, 0.14, 0.78);

    gl_FragColor = vec4(color, alpha);
  }
`;

const CONDUIT_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CONDUIT_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFocus;

  void main() {
    float angle = fract(vUv.x - uTime * (0.18 + uFocus * 0.08));
    float head1 = smoothstep(0.0, 0.22, angle) * (1.0 - smoothstep(0.22, 0.28, angle));
    float head2 = smoothstep(0.5, 0.72, angle) * (1.0 - smoothstep(0.72, 0.78, angle));
    float energy = max(head1, head2 * 0.75);

    vec3 baseTitanium = vec3(0.16, 0.28, 0.22);
    vec3 emerald = vec3(0.141, 0.898, 0.627);
    vec3 lime = vec3(0.835, 0.969, 0.647);

    vec3 col = mix(baseTitanium, emerald, energy);
    col = mix(col, lime, pow(energy, 2.5) * 0.88);
    float alpha = 0.34 + energy * (0.62 + uFocus * 0.15);

    gl_FragColor = vec4(col, alpha);
  }
`;

const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aScale;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aOrbitRadius;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uFocus;
  varying float vAlpha;
  varying float vMix;

  void main() {
    float t = uTime * aSpeed + aPhase;
    vec3 pos = position;

    // Intentional orbital drift around the core axis
    float cosT = cos(t * 0.45);
    float sinT = sin(t * 0.45);
    vec3 rotated = vec3(
      pos.x * cosT - pos.z * sinT,
      pos.y + sin(t * 1.4 + aPhase) * 0.14,
      pos.x * sinT + pos.z * cosT
    );

    // Subtle pointer field response
    vec2 pointerOffset = uPointer * vec2(0.28, 0.22) * (1.0 / (0.6 + aOrbitRadius * 0.35));
    rotated.x += pointerOffset.x;
    rotated.y += pointerOffset.y;

    // Slight radial contraction on password focus
    float focusScale = 1.0 - uFocus * 0.05;
    rotated *= focusScale;

    vec4 mvPosition = modelViewMatrix * vec4(rotated, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float distAttenuation = 28.0 / max(1.0, -mvPosition.z);
    gl_PointSize = clamp(aScale * distAttenuation, 1.5, 6.5);

    vAlpha = (0.34 + 0.5 * (0.5 + 0.5 * sin(uTime * 1.8 + aPhase))) * (0.85 + uFocus * 0.15);
    vMix = fract(aPhase * 0.3183);
  }
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying float vMix;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;

    float softCircle = pow(1.0 - d * 2.0, 1.8);
    vec3 emerald = vec3(0.141, 0.898, 0.627);
    vec3 lime = vec3(0.835, 0.969, 0.647);
    vec3 color = mix(emerald, lime, vMix);

    gl_FragColor = vec4(color, softCircle * vAlpha);
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

function KineticSculpture({ compact, interactionState }: { compact: boolean; interactionState: InteractionState }) {
  const rootGroup = useRef<THREE.Group>(null);
  const outerGlassRef = useRef<THREE.Mesh>(null);
  const innerGlassRef = useRef<THREE.Mesh>(null);
  const energyHeartRef = useRef<THREE.Mesh>(null);
  const veinCageRef = useRef<THREE.LineSegments>(null);
  const orbit1Ref = useRef<THREE.Group>(null);
  const orbit2Ref = useRef<THREE.Group>(null);
  const orbit3Ref = useRef<THREE.Group>(null);

  const coreMatRef = useRef<THREE.ShaderMaterial>(null);
  const innerGlassMatRef = useRef<THREE.ShaderMaterial>(null);
  const outerGlassMatRef = useRef<THREE.ShaderMaterial>(null);
  const conduitMatRef = useRef<THREE.ShaderMaterial>(null);
  const particleMatRef = useRef<THREE.ShaderMaterial>(null);

  const smoothState = useRef({
    px: 0,
    py: 0,
    focus: 0,
    hover: 0,
  });

  const coreUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFocus: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
    }),
    [],
  );

  const innerGlassUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFocus: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uShellLayer: { value: 1.0 },
    }),
    [],
  );

  const outerGlassUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFocus: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uShellLayer: { value: 0.45 },
    }),
    [],
  );

  const conduitUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFocus: { value: 0 },
    }),
    [],
  );

  const particleUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uFocus: { value: 0 },
    }),
    [],
  );

  // Geometries with proper disposal
  const geometries = useMemo(() => {
    const outerOcta = new THREE.OctahedronGeometry(1.16, 0);
    const outerEdges = new THREE.EdgesGeometry(outerOcta);

    const innerDodeca = new THREE.DodecahedronGeometry(0.9, 0);
    const innerEdges = new THREE.EdgesGeometry(innerDodeca);

    const veinIcosa = new THREE.IcosahedronGeometry(0.68, 1);
    const veinEdges = new THREE.EdgesGeometry(veinIcosa);
    veinIcosa.dispose();

    const coreIcosa = new THREE.IcosahedronGeometry(0.46, 3);

    // Orbit 1: Primary Machined Titanium Gimbal Ring + 6 Calibration Nodes
    const orbit1Torus = new THREE.TorusGeometry(1.58, 0.015, 16, 120);
    const nodeGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.11, 12);

    // Orbit 2: Elliptical Emerald Energy Conduit
    const orbit2Torus = new THREE.TorusGeometry(1.9, 0.012, 12, 128);

    // Orbit 3: Precision 72-Tick Telemetry Dial Ring
    const tickPositions: number[] = [];
    const tickCount = 72;
    const dialRadius = 2.18;
    for (let i = 0; i < tickCount; i++) {
      const theta = (i / tickCount) * Math.PI * 2;
      const isMajor = i % 6 === 0;
      const innerR = dialRadius - (isMajor ? 0.075 : 0.035);
      const outerR = dialRadius + (isMajor ? 0.035 : 0.015);
      tickPositions.push(
        Math.cos(theta) * innerR,
        Math.sin(theta) * innerR,
        0,
        Math.cos(theta) * outerR,
        Math.sin(theta) * outerR,
        0,
      );
    }
    const dialTicksGeo = new THREE.BufferGeometry();
    dialTicksGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(tickPositions, 3),
    );

    // Particle Field Geometry
    const particleCount = compact ? 54 : 108;
    const pPositions = new Float32Array(particleCount * 3);
    const pScales = new Float32Array(particleCount);
    const pPhases = new Float32Array(particleCount);
    const pSpeeds = new Float32Array(particleCount);
    const pRadii = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const ratio = i / particleCount;
      const goldenAngle = i * 2.399963229728653;
      const radius = 1.32 + Math.pow(ratio, 0.85) * 1.75;
      const ySpread = (Math.sin(i * 1.73) * 0.82 + Math.cos(i * 0.91) * 0.42) * 1.05;

      pPositions[i * 3] = Math.cos(goldenAngle) * radius;
      pPositions[i * 3 + 1] = ySpread;
      pPositions[i * 3 + 2] = Math.sin(goldenAngle) * radius;

      pScales[i] = 1.7 + (i % 5) * 0.65;
      pPhases[i] = (i * 0.785398) % (Math.PI * 2);
      pSpeeds[i] = 0.25 + (i % 7) * 0.06;
      pRadii[i] = radius;
    }

    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute("position", new THREE.BufferAttribute(pPositions, 3));
    particlesGeo.setAttribute("aScale", new THREE.BufferAttribute(pScales, 1));
    particlesGeo.setAttribute("aPhase", new THREE.BufferAttribute(pPhases, 1));
    particlesGeo.setAttribute("aSpeed", new THREE.BufferAttribute(pSpeeds, 1));
    particlesGeo.setAttribute("aOrbitRadius", new THREE.BufferAttribute(pRadii, 1));

    return {
      outerOcta,
      outerEdges,
      innerDodeca,
      innerEdges,
      veinEdges,
      coreIcosa,
      orbit1Torus,
      nodeGeo,
      orbit2Torus,
      dialTicksGeo,
      particlesGeo,
    };
  }, [compact]);

  useEffect(() => {
    return () => {
      geometries.outerOcta.dispose();
      geometries.outerEdges.dispose();
      geometries.innerDodeca.dispose();
      geometries.innerEdges.dispose();
      geometries.veinEdges.dispose();
      geometries.coreIcosa.dispose();
      geometries.orbit1Torus.dispose();
      geometries.nodeGeo.dispose();
      geometries.orbit2Torus.dispose();
      geometries.dialTicksGeo.dispose();
      geometries.particlesGeo.dispose();
    };
  }, [geometries]);

  const calibrationAngles = useMemo(
    () => [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, (4 * Math.PI) / 3, (5 * Math.PI) / 3],
    [],
  );

  useFrame((state, rawDelta) => {
    if (interactionState.hidden) return;
    const delta = Math.min(rawDelta, 0.05);
    const elapsed = state.clock.getElapsedTime();

    const targetFocus =
      interactionState.focusLevel * 0.45 +
      interactionState.hoverBoost * 0.35 +
      interactionState.pulseSurge;

    interactionState.pulseSurge = THREE.MathUtils.damp(
      interactionState.pulseSurge,
      0,
      3.2,
      delta,
    );

    smoothState.current.px = THREE.MathUtils.damp(
      smoothState.current.px,
      interactionState.pointerX,
      4.2,
      delta,
    );
    smoothState.current.py = THREE.MathUtils.damp(
      smoothState.current.py,
      interactionState.pointerY,
      4.2,
      delta,
    );
    smoothState.current.focus = THREE.MathUtils.damp(
      smoothState.current.focus,
      targetFocus,
      3.8,
      delta,
    );

    const { px, py, focus } = smoothState.current;

    if (coreMatRef.current) {
      coreMatRef.current.uniforms.uTime.value = elapsed;
      coreMatRef.current.uniforms.uFocus.value = focus;
      coreMatRef.current.uniforms.uPointer.value.set(px, py);
    }

    if (innerGlassMatRef.current) {
      innerGlassMatRef.current.uniforms.uTime.value = elapsed;
      innerGlassMatRef.current.uniforms.uFocus.value = focus;
      innerGlassMatRef.current.uniforms.uPointer.value.set(px, py);
    }

    if (outerGlassMatRef.current) {
      outerGlassMatRef.current.uniforms.uTime.value = elapsed;
      outerGlassMatRef.current.uniforms.uFocus.value = focus;
      outerGlassMatRef.current.uniforms.uPointer.value.set(px, py);
    }

    if (conduitMatRef.current) {
      conduitMatRef.current.uniforms.uTime.value = elapsed;
      conduitMatRef.current.uniforms.uFocus.value = focus;
    }

    if (particleMatRef.current) {
      particleMatRef.current.uniforms.uTime.value = elapsed;
      particleMatRef.current.uniforms.uFocus.value = focus;
      particleMatRef.current.uniforms.uPointer.value.set(px, py);
    }

    if (rootGroup.current) {
      const targetRotY = px * 0.38 + Math.sin(elapsed * 0.35) * 0.08;
      const targetRotX = -py * 0.28 + Math.cos(elapsed * 0.28) * 0.06 + focus * 0.12;
      rootGroup.current.rotation.y = THREE.MathUtils.damp(
        rootGroup.current.rotation.y,
        targetRotY,
        4.0,
        delta,
      );
      rootGroup.current.rotation.x = THREE.MathUtils.damp(
        rootGroup.current.rotation.x,
        targetRotX,
        4.0,
        delta,
      );
      const basePosY = compact ? 0.04 : 0.34;
      rootGroup.current.position.y = basePosY + Math.sin(elapsed * 0.9) * 0.06;
    }

    const speedMultiplier = 1 + focus * 0.55;

    if (outerGlassRef.current) {
      outerGlassRef.current.rotation.y += delta * 0.18 * speedMultiplier;
      outerGlassRef.current.rotation.x += delta * 0.09 * speedMultiplier;
    }
    if (innerGlassRef.current) {
      innerGlassRef.current.rotation.y -= delta * 0.24 * speedMultiplier;
      innerGlassRef.current.rotation.z += delta * 0.14 * speedMultiplier;
    }
    if (veinCageRef.current) {
      veinCageRef.current.rotation.y += delta * 0.32 * speedMultiplier;
      veinCageRef.current.rotation.x -= delta * 0.19 * speedMultiplier;
    }
    if (energyHeartRef.current) {
      const heartScale = 1 + Math.sin(elapsed * 2.4) * 0.05 + focus * 0.08;
      energyHeartRef.current.scale.setScalar(heartScale);
      energyHeartRef.current.rotation.y += delta * 0.38 * speedMultiplier;
    }

    if (orbit1Ref.current) {
      orbit1Ref.current.rotation.z += delta * 0.22 * speedMultiplier;
      orbit1Ref.current.rotation.x = THREE.MathUtils.damp(
        orbit1Ref.current.rotation.x,
        0.58 - focus * 0.18 + py * 0.12,
        3.5,
        delta,
      );
    }
    if (orbit2Ref.current) {
      orbit2Ref.current.rotation.z -= delta * 0.31 * speedMultiplier;
      orbit2Ref.current.rotation.y = THREE.MathUtils.damp(
        orbit2Ref.current.rotation.y,
        0.46 + focus * 0.22 + px * 0.14,
        3.5,
        delta,
      );
    }
    if (orbit3Ref.current) {
      orbit3Ref.current.rotation.z += delta * 0.12 * speedMultiplier;
      orbit3Ref.current.rotation.x = THREE.MathUtils.damp(
        orbit3Ref.current.rotation.x,
        -0.42 + focus * 0.15,
        3.0,
        delta,
      );
    }
  });

  const baseScale = compact ? 0.78 : 0.86;

  return (
    <group
      ref={rootGroup}
      scale={baseScale}
      position={[compact ? 0 : 0.14, compact ? 0.04 : 0.34, 0]}
    >
      <ambientLight intensity={0.65} color="#102b20" />
      <directionalLight position={[-4, 5, 4]} intensity={2.2} color="#d5f7a5" />
      <directionalLight position={[4, -3, 3]} intensity={1.4} color="#24e5a0" />

      {/* 1. CENTRAL CORE — Inner Bioluminescent Singularity */}
      <mesh ref={energyHeartRef} geometry={geometries.coreIcosa} renderOrder={1}>
        <shaderMaterial
          ref={coreMatRef}
          vertexShader={CORE_VERTEX_SHADER}
          fragmentShader={CORE_FRAGMENT_SHADER}
          transparent
          uniforms={coreUniforms}
        />
      </mesh>

      {/* 1B. CENTRAL CORE — Internal Geodesic Emerald Energy Veins */}
      <lineSegments ref={veinCageRef} geometry={geometries.veinEdges} renderOrder={2}>
        <lineBasicMaterial
          color="#24e5a0"
          transparent
          opacity={0.58}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* 1C. CENTRAL CORE — Inner Faceted Obsidian Refraction Shell */}
      <mesh ref={innerGlassRef} geometry={geometries.innerDodeca} renderOrder={3}>
        <shaderMaterial
          ref={innerGlassMatRef}
          vertexShader={GLASS_VERTEX_SHADER}
          fragmentShader={GLASS_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          uniforms={innerGlassUniforms}
        />
        <lineSegments geometry={geometries.innerEdges}>
          <lineBasicMaterial
            color="#24e5a0"
            transparent
            opacity={0.42}
            depthWrite={false}
          />
        </lineSegments>
      </mesh>

      {/* 1D. CENTRAL CORE — Outer Translucent Obsidian Monolith & Titanium Ribs */}
      <mesh ref={outerGlassRef} geometry={geometries.outerOcta} renderOrder={4}>
        <shaderMaterial
          ref={outerGlassMatRef}
          vertexShader={GLASS_VERTEX_SHADER}
          fragmentShader={GLASS_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          uniforms={outerGlassUniforms}
        />
        <lineSegments geometry={geometries.outerEdges}>
          <lineBasicMaterial
            color="#b8d9c9"
            transparent
            opacity={0.62}
            depthWrite={false}
          />
        </lineSegments>
      </mesh>

      {/* 2A. ORBIT 1 — Primary Machined Titanium Gimbal Ring + Calibration Nodes */}
      <group ref={orbit1Ref} rotation={[0.58, 0.22, 0.14]}>
        <mesh geometry={geometries.orbit1Torus}>
          <meshStandardMaterial
            color="#8ca89b"
            emissive="#123829"
            emissiveIntensity={0.35}
            metalness={0.88}
            roughness={0.18}
          />
        </mesh>
        {calibrationAngles.map((angle, idx) => (
          <mesh
            key={idx}
            geometry={geometries.nodeGeo}
            position={[Math.cos(angle) * 1.58, Math.sin(angle) * 1.58, 0]}
            rotation={[0, 0, angle + Math.PI / 2]}
          >
            <meshStandardMaterial
              color="#d5f7a5"
              emissive="#24e5a0"
              emissiveIntensity={idx % 2 === 0 ? 1.35 : 0.65}
              metalness={0.5}
              roughness={0.18}
            />
          </mesh>
        ))}
      </group>

      {/* 2B. ORBIT 2 — Elliptical Emerald Energy Conduit */}
      <group ref={orbit2Ref} rotation={[-0.52, 0.46, -0.28]}>
        <mesh geometry={geometries.orbit2Torus}>
          <shaderMaterial
            ref={conduitMatRef}
            vertexShader={CONDUIT_VERTEX_SHADER}
            fragmentShader={CONDUIT_FRAGMENT_SHADER}
            transparent
            depthWrite={false}
            uniforms={conduitUniforms}
          />
        </mesh>
      </group>

      {/* 2C. ORBIT 3 — Precision 72-Tick Telemetry Dial Ring */}
      <group ref={orbit3Ref} rotation={[-0.42, -0.64, 0.36]}>
        <lineSegments geometry={geometries.dialTicksGeo}>
          <lineBasicMaterial color="#6ca38b" transparent opacity={0.48} />
        </lineSegments>
      </group>

      {/* 3. PARTICLE SYSTEM — Intentional Orbital & Pointer-Reactive Field */}
      <points geometry={geometries.particlesGeo} renderOrder={5}>
        <shaderMaterial
          ref={particleMatRef}
          vertexShader={PARTICLE_VERTEX_SHADER}
          fragmentShader={PARTICLE_FRAGMENT_SHADER}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={particleUniforms}
        />
      </points>
    </group>
  );
}

export default function AiquorCore({ onUnavailable }: { onUnavailable: () => void }) {
  const interaction = useRef({ ...initialInteraction });
  const interactionState = interaction.current;
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
        interactionState.pulseSurge = 0.45;
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
      interactionState.pulseSurge = 0.95;
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
  }, [interactionState]);

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
        }}
      >
        <CanvasLifecycle onUnavailable={onUnavailable} />
        <KineticSculpture compact={compact} interactionState={interactionState} />
      </Canvas>
    </div>
  );
}
