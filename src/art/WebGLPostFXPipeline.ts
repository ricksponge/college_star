import * as THREE from 'three';

// ============================================================================
// 1. SHADERS GLSL COMPATIBLES THREE.JS (HALO NÉON SUPER & ONDE DE CHOC KO)
// ============================================================================

export interface ISuperNeonHaloUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uCharge: THREE.IUniform<number>;
  uIntensity: THREE.IUniform<number>;
  uColorPrimary: THREE.IUniform<THREE.Color>;
  uColorSecondary: THREE.IUniform<THREE.Color>;
}

export interface IKnockoutShockwaveUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uProgress: THREE.IUniform<number>;
  uCenter: THREE.IUniform<THREE.Vector2>;
  uRadius: THREE.IUniform<number>;
  uIntensity: THREE.IUniform<number>;
  uAspect: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
  tDiffuse: THREE.IUniform<THREE.Texture | null>;
  uHasTexture: THREE.IUniform<number>;
}

const SHARED_QUAD_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Shader GLSL d'aura radiale énergétique avec anneaux rotatifs,
 * arcs électriques procéduraux et lueur dorée/cyan quand Super = 100%.
 */
export const SuperNeonHaloShader = {
  vertexShader: SHARED_QUAD_VERTEX_SHADER,
  fragmentShader: /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uCharge;
uniform float uIntensity;
uniform vec3 uColorPrimary;
uniform vec3 uColorSecondary;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float electricWave(float angle, float time, float freq) {
  float a1 = sin(angle * freq + time * 9.0);
  float a2 = sin(angle * (freq * 2.13) - time * 14.5) * 0.5;
  float a3 = cos(angle * (freq * 4.37) + time * 21.0) * 0.25;
  return (a1 + a2 + a3) / 1.75;
}

void main() {
  vec2 centered = (vUv - 0.5) * 2.0;
  float r = length(centered);
  if (r > 1.0) {
    discard;
  }

  float charge = clamp(uCharge, 0.0, 1.0);
  float superReady = smoothstep(0.95, 1.0, charge);
  float angle = atan(centered.y, centered.x + 1e-5);

  // Lueur radiale centrale + dégradé périphérique doux
  float coreGlow = exp(-r * 3.8) * (0.28 + 0.55 * charge);
  float edgeFade = smoothstep(1.0, 0.72, r);

  // Anneau externe doré segmenté en rotation rapide
  float rotOuter = angle + uTime * (1.8 + 2.2 * superReady);
  float outerDash = smoothstep(0.15, 0.55, sin(rotOuter * 6.0));
  float outerRing = exp(-pow((r - 0.72) * 26.0, 2.0)) * (0.35 + 0.65 * outerDash);

  // Anneau interne cyan en rotation inverse
  float rotInner = angle - uTime * (2.6 + 2.5 * superReady);
  float innerDash = smoothstep(-0.1, 0.5, sin(rotInner * 10.0));
  float innerRing = exp(-pow((r - 0.53) * 30.0, 2.0)) * (0.25 + 0.75 * innerDash);

  // Arcs électriques procéduraux activés lorsque Super atteint 100%
  float arcJitter = electricWave(angle, uTime, 7.0) * 0.055;
  float arcBand = exp(-abs(r - (0.63 + arcJitter)) * 55.0);
  float arcFlicker = 0.65 + 0.35 * sin(uTime * 28.0 + hash11(floor(uTime * 18.0)) * 6.2831);
  float electricArc = arcBand * superReady * arcFlicker;

  // Rayons solaires façon Supercell
  float rays = pow(max(0.0, sin(angle * 8.0 + uTime * 2.4)), 4.0) * exp(-r * 2.1) * superReady;

  vec3 col = mix(uColorSecondary, uColorPrimary, 0.55 + 0.45 * sin(angle * 2.0 + uTime * 3.0));
  vec3 finalColor =
    uColorPrimary * (coreGlow + outerRing * 1.35 + rays * 0.95) +
    uColorSecondary * (innerRing * 1.25 + electricArc * 1.85) +
    vec3(1.0, 0.98, 0.88) * (electricArc * 0.8) +
    col * (coreGlow * 0.25);

  float alpha = clamp((coreGlow + outerRing + innerRing + electricArc + rays) * edgeFade * uIntensity * (0.3 + 0.7 * charge), 0.0, 1.0);
  gl_FragColor = vec4(finalColor, alpha);
}
`,
  createUniforms(options?: {
    charge?: number;
    intensity?: number;
    primaryColor?: string | number;
    secondaryColor?: string | number;
  }): ISuperNeonHaloUniforms {
    return {
      uTime: { value: 0 },
      uCharge: { value: options?.charge ?? 1.0 },
      uIntensity: { value: options?.intensity ?? 1.15 },
      uColorPrimary: { value: new THREE.Color(options?.primaryColor ?? 0xfacc15) },
      uColorSecondary: { value: new THREE.Color(options?.secondaryColor ?? 0x22d3ee) },
    };
  },
};

/**
 * Shader GLSL d'onde de choc sur KO avec distorsion radiale d'écran,
 * aberration chromatique RGB et flash lumineux central.
 */
export const KnockoutShockwaveShader = {
  vertexShader: SHARED_QUAD_VERTEX_SHADER,
  fragmentShader: /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uProgress;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uIntensity;
uniform float uAspect;
uniform vec3 uColor;
uniform sampler2D tDiffuse;
uniform float uHasTexture;

void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  float easeOut = 1.0 - pow(1.0 - p, 3.0);
  float waveRadius = max(0.001, easeOut * uRadius);
  float waveWidth = mix(0.11, 0.032, p);

  vec2 delta = vUv - uCenter;
  vec2 aspectDelta = vec2(delta.x * uAspect, delta.y);
  float dist = length(aspectDelta);
  vec2 dir = dist > 1e-5 ? normalize(aspectDelta) : vec2(0.0, 1.0);
  vec2 dirUv = vec2(dir.x / max(uAspect, 0.001), dir.y);

  float bandDist = abs(dist - waveRadius);
  float ringMask = smoothstep(waveWidth, 0.0, bandDist);
  float fadeOut = (1.0 - p) * (1.0 - p);

  // Distorsion radiale + aberration chromatique R/G/B sur le front de l'onde
  float strength = ringMask * fadeOut * uIntensity * 0.055;
  vec2 distortedUv = vUv - dirUv * strength;
  vec2 chromaOffset = dirUv * strength * 0.65;

  // Flash blanc lumineux à l'impact initial
  float centerFlash = exp(-dist * 9.0) * (1.0 - smoothstep(0.0, 0.35, p)) * 0.9 * clamp(uIntensity, 0.0, 2.0);

  if (uHasTexture > 0.5) {
    float rChan = texture2D(tDiffuse, clamp(distortedUv + chromaOffset, 0.0, 1.0)).r;
    float gChan = texture2D(tDiffuse, clamp(distortedUv, 0.0, 1.0)).g;
    float bChan = texture2D(tDiffuse, clamp(distortedUv - chromaOffset, 0.0, 1.0)).b;
    vec3 baseCol = vec3(rChan, gChan, bChan);
    vec3 ringGlow = uColor * ringMask * fadeOut * 0.85 * uIntensity;
    vec3 flashGlow = vec3(1.0, 0.98, 0.9) * centerFlash;
    gl_FragColor = vec4(baseCol + ringGlow + flashGlow, 1.0);
  } else {
    // Mode mesh/overlay additif autonome (sans render target)
    float ringCore = exp(-pow(bandDist / max(0.008, waveWidth * 0.42), 2.0));
    float ringRed = exp(-pow(abs(dist - (waveRadius + 0.018)) / max(0.01, waveWidth * 0.48), 2.0));
    float ringCyan = exp(-pow(abs(dist - (waveRadius - 0.018)) / max(0.01, waveWidth * 0.48), 2.0));
    float rays = pow(max(0.0, cos(atan(aspectDelta.y, aspectDelta.x + 1e-5) * 12.0 + uTime * 3.0)), 6.0)
      * ringMask * 0.45;

    vec3 fringe = vec3(1.0, 0.25, 0.45) * ringRed * 0.7 + vec3(0.15, 0.9, 1.0) * ringCyan * 0.7;
    vec3 core = (uColor + vec3(0.4)) * (ringCore + rays) + vec3(1.0) * centerFlash;
    float alpha = clamp((ringCore * 0.9 + (ringRed + ringCyan) * 0.4 + centerFlash) * fadeOut * uIntensity, 0.0, 1.0);
    gl_FragColor = vec4(core + fringe, alpha);
  }
}
`,
  createUniforms(options?: {
    center?: THREE.Vector2;
    radius?: number;
    intensity?: number;
    aspect?: number;
    color?: string | number;
    diffuseTexture?: THREE.Texture | null;
  }): IKnockoutShockwaveUniforms {
    const tex = options?.diffuseTexture ?? null;
    return {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uCenter: { value: options?.center ? options.center.clone() : new THREE.Vector2(0.5, 0.5) },
      uRadius: { value: options?.radius ?? 0.85 },
      uIntensity: { value: options?.intensity ?? 1.2 },
      uAspect: { value: options?.aspect ?? 1.5 },
      uColor: { value: new THREE.Color(options?.color ?? 0xfacc15) },
      tDiffuse: { value: tex },
      uHasTexture: { value: tex ? 1.0 : 0.0 },
    };
  },
};

export function createSuperNeonHaloMaterial(options?: {
  charge?: number;
  intensity?: number;
  primaryColor?: string | number;
  secondaryColor?: string | number;
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: SuperNeonHaloShader.createUniforms(options),
    vertexShader: SuperNeonHaloShader.vertexShader,
    fragmentShader: SuperNeonHaloShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createKnockoutShockwaveMaterial(options?: {
  center?: THREE.Vector2;
  radius?: number;
  intensity?: number;
  aspect?: number;
  color?: string | number;
  diffuseTexture?: THREE.Texture | null;
}): THREE.ShaderMaterial {
  const hasTex = Boolean(options?.diffuseTexture);
  return new THREE.ShaderMaterial({
    uniforms: KnockoutShockwaveShader.createUniforms(options),
    vertexShader: KnockoutShockwaveShader.vertexShader,
    fragmentShader: KnockoutShockwaveShader.fragmentShader,
    transparent: !hasTex,
    depthWrite: false,
    blending: hasTex ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// ============================================================================
// 2. GESTIONNAIRE D'IMPACTS STYLISÉS BD/SUPERCELL (POOL 60 FPS ZERO-GC)
// ============================================================================

export type ImpactKind =
  | 'CRITICAL_STARBURST'
  | 'CORRECT_HIT'
  | 'ERROR_BOUNCE'
  | 'HIT_FLASH'
  | 'SUPER_BLAST';

export interface IImpactSpawnOptions {
  x: number;
  y: number;
  kind?: ImpactKind;
  color?: string;
  scale?: number;
  durationSec?: number;
  points?: number;
  label?: string;
}

export interface IShockwaveOptions {
  x: number;
  y: number;
  color?: string;
  maxRadius?: number;
  durationSec?: number;
  intensity?: number;
  isBossKo?: boolean;
}

export interface ISuperHaloOptions {
  active: boolean;
  x?: number;
  y?: number;
  chargePct?: number;
  primaryColor?: string;
  secondaryColor?: string;
  radius?: number;
}

interface IPooledImpact {
  active: boolean;
  x: number;
  y: number;
  kind: ImpactKind;
  color: string;
  scale: number;
  age: number;
  maxAge: number;
  points: number;
  rotation: number;
  spinSpeed: number;
  label: string;
}

interface IPooledShockwave {
  active: boolean;
  x: number;
  y: number;
  color: string;
  maxRadius: number;
  age: number;
  maxAge: number;
  intensity: number;
  isBossKo: boolean;
}

interface IPooledSpark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  size: number;
  color: string;
  metallic: boolean;
  age: number;
  maxAge: number;
  rotation: number;
  rotSpeed: number;
}

interface ISuperHaloState {
  active: boolean;
  x: number;
  y: number;
  chargePct: number;
  primaryColor: string;
  secondaryColor: string;
  radius: number;
}

const MAX_IMPACTS_POOL = 48;
const MAX_SHOCKWAVES_POOL = 16;
const MAX_SPARKS_POOL = 128;

function defaultColorForKind(kind: ImpactKind): string {
  switch (kind) {
    case 'CRITICAL_STARBURST':
      return '#facc15';
    case 'CORRECT_HIT':
      return '#38e54d';
    case 'ERROR_BOUNCE':
      return '#fb7185';
    case 'HIT_FLASH':
      return '#ffffff';
    case 'SUPER_BLAST':
      return '#22d3ee';
  }
}

function defaultDurationForKind(kind: ImpactKind): number {
  switch (kind) {
    case 'HIT_FLASH':
      return 0.14;
    case 'ERROR_BOUNCE':
      return 0.34;
    case 'CORRECT_HIT':
      return 0.32;
    case 'CRITICAL_STARBURST':
      return 0.38;
    case 'SUPER_BLAST':
      return 0.52;
  }
}

function acquirePoolSlot<T extends { active: boolean; age: number }>(pool: T[]): T {
  let oldestIndex = 0;
  let maxAgeSeen = -1;
  for (let i = 0; i < pool.length; i++) {
    const slot = pool[i];
    if (!slot.active) {
      return slot;
    }
    if (slot.age > maxAgeSeen) {
      maxAgeSeen = slot.age;
      oldestIndex = i;
    }
  }
  return pool[oldestIndex];
}

function drawStarburstPolygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
  rotation: number
): void {
  const totalVertices = Math.max(8, points * 2);
  ctx.beginPath();
  for (let i = 0; i < totalVertices; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = rotation + (i / totalVertices) * Math.PI * 2;
    const vx = x + Math.cos(angle) * r;
    const vy = y + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(vx, vy);
    } else {
      ctx.lineTo(vx, vy);
    }
  }
  ctx.closePath();
}

export class StylizedImpactFX {
  private readonly impacts: IPooledImpact[] = [];
  private readonly shockwaves: IPooledShockwave[] = [];
  private readonly sparks: IPooledSpark[] = [];
  private readonly halo: ISuperHaloState = {
    active: false,
    x: 0,
    y: 0,
    chargePct: 0,
    primaryColor: '#facc15',
    secondaryColor: '#22d3ee',
    radius: 54,
  };
  private elapsedTime = 0;
  private shakeTimeRemaining = 0;
  private shakeMagnitude = 0;

  constructor() {
    for (let i = 0; i < MAX_IMPACTS_POOL; i++) {
      this.impacts.push({
        active: false,
        x: 0,
        y: 0,
        kind: 'CORRECT_HIT',
        color: '#38e54d',
        scale: 1,
        age: 0,
        maxAge: 0.35,
        points: 8,
        rotation: 0,
        spinSpeed: 0,
        label: '',
      });
    }
    for (let i = 0; i < MAX_SHOCKWAVES_POOL; i++) {
      this.shockwaves.push({
        active: false,
        x: 0,
        y: 0,
        color: '#facc15',
        maxRadius: 160,
        age: 0,
        maxAge: 0.45,
        intensity: 1,
        isBossKo: false,
      });
    }
    for (let i = 0; i < MAX_SPARKS_POOL; i++) {
      this.sparks.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        drag: 4,
        size: 6,
        color: '#facc15',
        metallic: false,
        age: 0,
        maxAge: 0.3,
        rotation: 0,
        rotSpeed: 0,
      });
    }
  }

  public spawnImpact(options: IImpactSpawnOptions): void {
    const kind: ImpactKind = options.kind ?? 'CORRECT_HIT';
    const color = options.color ?? defaultColorForKind(kind);
    const scale = options.scale ?? 1;
    const duration = options.durationSec ?? defaultDurationForKind(kind);

    const slot = acquirePoolSlot(this.impacts);
    slot.active = true;
    slot.x = options.x;
    slot.y = options.y;
    slot.kind = kind;
    slot.color = color;
    slot.scale = scale;
    slot.age = 0;
    slot.maxAge = Math.max(0.05, duration);
    slot.points = options.points ?? (kind === 'SUPER_BLAST' ? 12 : kind === 'CRITICAL_STARBURST' ? 10 : 8);
    slot.rotation = Math.random() * Math.PI * 2;
    slot.spinSpeed = kind === 'ERROR_BOUNCE' ? -3.2 : 2.6;
    slot.label = options.label ?? '';

    const sparkCount =
      kind === 'HIT_FLASH'
        ? 4
        : kind === 'SUPER_BLAST'
        ? 18
        : kind === 'CRITICAL_STARBURST'
        ? 14
        : 10;

    this.spawnSparkBurst(
      options.x,
      options.y,
      sparkCount,
      color,
      kind === 'ERROR_BOUNCE',
      scale
    );

    if (kind === 'CRITICAL_STARBURST' || kind === 'SUPER_BLAST') {
      this.addScreenShake(kind === 'SUPER_BLAST' ? 9 * scale : 5 * scale, 0.16);
    }
  }

  public triggerShockwave(options: IShockwaveOptions): void {
    const slot = acquirePoolSlot(this.shockwaves);
    slot.active = true;
    slot.x = options.x;
    slot.y = options.y;
    slot.color = options.color ?? '#facc15';
    slot.maxRadius = options.maxRadius ?? (options.isBossKo ? 260 : 165);
    slot.age = 0;
    slot.maxAge = Math.max(0.12, options.durationSec ?? (options.isBossKo ? 0.62 : 0.42));
    slot.intensity = options.intensity ?? (options.isBossKo ? 1.45 : 1.0);
    slot.isBossKo = Boolean(options.isBossKo);

    this.spawnSparkBurst(
      options.x,
      options.y,
      options.isBossKo ? 22 : 12,
      slot.color,
      false,
      options.isBossKo ? 1.35 : 1.0
    );

    this.addScreenShake(options.isBossKo ? 12 : 6.5, options.isBossKo ? 0.28 : 0.18);
  }

  public setSuperHalo(options: ISuperHaloOptions): void {
    this.halo.active = options.active;
    if (options.x !== undefined) {
      this.halo.x = options.x;
    }
    if (options.y !== undefined) {
      this.halo.y = options.y;
    }
    if (options.chargePct !== undefined) {
      this.halo.chargePct = Math.max(0, Math.min(100, options.chargePct));
    } else if (options.active) {
      this.halo.chargePct = 100;
    }
    if (options.primaryColor !== undefined) {
      this.halo.primaryColor = options.primaryColor;
    }
    if (options.secondaryColor !== undefined) {
      this.halo.secondaryColor = options.secondaryColor;
    }
    if (options.radius !== undefined) {
      this.halo.radius = options.radius;
    }
  }

  public update(dtSec: number): void {
    if (dtSec <= 0) {
      return;
    }
    const dt = Math.min(dtSec, 0.1);
    this.elapsedTime += dt;

    if (this.shakeTimeRemaining > 0) {
      this.shakeTimeRemaining = Math.max(0, this.shakeTimeRemaining - dt);
      if (this.shakeTimeRemaining === 0) {
        this.shakeMagnitude = 0;
      }
    }

    for (let i = 0; i < this.impacts.length; i++) {
      const imp = this.impacts[i];
      if (!imp.active) {
        continue;
      }
      imp.age += dt;
      imp.rotation += imp.spinSpeed * dt;
      if (imp.age >= imp.maxAge) {
        imp.active = false;
      }
    }

    for (let i = 0; i < this.shockwaves.length; i++) {
      const wave = this.shockwaves[i];
      if (!wave.active) {
        continue;
      }
      wave.age += dt;
      if (wave.age >= wave.maxAge) {
        wave.active = false;
      }
    }

    for (let i = 0; i < this.sparks.length; i++) {
      const spark = this.sparks[i];
      if (!spark.active) {
        continue;
      }
      spark.age += dt;
      if (spark.age >= spark.maxAge) {
        spark.active = false;
        continue;
      }
      const damping = Math.exp(-spark.drag * dt);
      spark.vx *= damping;
      spark.vy *= damping;
      if (spark.metallic) {
        spark.vy += 380 * dt;
      }
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.rotation += spark.rotSpeed * dt;
    }
  }

  public renderOverlay2D(
    ctx: CanvasRenderingContext2D,
    viewportWidth?: number,
    viewportHeight?: number
  ): void {
    ctx.save();
    if (viewportWidth !== undefined && viewportHeight !== undefined) {
      ctx.beginPath();
      ctx.rect(0, 0, viewportWidth, viewportHeight);
      ctx.clip();
    }

    this.renderSuperHalo2D(ctx);
    this.renderShockwaves2D(ctx);
    this.renderImpacts2D(ctx);
    this.renderSparks2D(ctx);
    ctx.restore();
  }

  public getScreenShakeOffset(): { x: number; y: number } {
    if (this.shakeTimeRemaining <= 0 || this.shakeMagnitude <= 0) {
      return { x: 0, y: 0 };
    }
    const damper = Math.min(1, this.shakeTimeRemaining / 0.16);
    const amp = this.shakeMagnitude * damper;
    return {
      x: Math.sin(this.elapsedTime * 72) * amp,
      y: Math.cos(this.elapsedTime * 89) * amp * 0.75,
    };
  }

  public getActiveStats(): { impacts: number; shockwaves: number; sparks: number } {
    let impacts = 0;
    let shockwaves = 0;
    let sparks = 0;
    for (let i = 0; i < this.impacts.length; i++) {
      if (this.impacts[i].active) impacts++;
    }
    for (let i = 0; i < this.shockwaves.length; i++) {
      if (this.shockwaves[i].active) shockwaves++;
    }
    for (let i = 0; i < this.sparks.length; i++) {
      if (this.sparks[i].active) sparks++;
    }
    return { impacts, shockwaves, sparks };
  }

  public clear(): void {
    for (let i = 0; i < this.impacts.length; i++) {
      this.impacts[i].active = false;
    }
    for (let i = 0; i < this.shockwaves.length; i++) {
      this.shockwaves[i].active = false;
    }
    for (let i = 0; i < this.sparks.length; i++) {
      this.sparks[i].active = false;
    }
    this.halo.active = false;
    this.shakeTimeRemaining = 0;
    this.shakeMagnitude = 0;
  }

  private addScreenShake(magnitude: number, durationSec: number): void {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeTimeRemaining = Math.max(this.shakeTimeRemaining, durationSec);
  }

  private spawnSparkBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    metallic: boolean,
    scale: number
  ): void {
    const safeCount = Math.max(1, count);
    for (let i = 0; i < safeCount; i++) {
      const slot = acquirePoolSlot(this.sparks);
      const baseAngle = (i / safeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
      const speed = (metallic ? 150 + Math.random() * 190 : 120 + Math.random() * 230) * scale;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vx = Math.cos(baseAngle) * speed;
      slot.vy = Math.sin(baseAngle) * speed - (metallic ? 85 : 0);
      slot.drag = metallic ? 2.4 : 4.2;
      slot.size = (metallic ? 5 + Math.random() * 4 : 4 + Math.random() * 6) * scale;
      slot.color = metallic ? (i % 2 === 0 ? '#e2e8f0' : '#fb7185') : i % 3 === 0 ? '#ffffff' : color;
      slot.metallic = metallic;
      slot.age = 0;
      slot.maxAge = 0.22 + Math.random() * 0.18;
      slot.rotation = baseAngle;
      slot.rotSpeed = (Math.random() - 0.5) * 14;
    }
  }

  private renderSuperHalo2D(ctx: CanvasRenderingContext2D): void {
    if (!this.halo.active) {
      return;
    }
    const charge = this.halo.chargePct / 100;
    const pulse = 1 + 0.08 * Math.sin(this.elapsedTime * 7.5);
    const r = this.halo.radius * pulse;
    const { x, y, primaryColor, secondaryColor } = this.halo;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const grad = ctx.createRadialGradient(x, y, r * 0.12, x, y, r * 1.4);
    grad.addColorStop(0, secondaryColor);
    grad.addColorStop(0.55, primaryColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.25 + 0.35 * charge;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Anneau externe doré segmenté
    ctx.globalAlpha = 0.85 * Math.max(0.35, charge);
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 9]);
    ctx.lineDashOffset = -this.elapsedTime * 48;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.02, 0, Math.PI * 2);
    ctx.stroke();

    // Anneau interne cyan en contre-rotation
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 2.8;
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = this.elapsedTime * 64;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arcs électriques procéduraux à 100% Super
    if (charge >= 0.99) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      for (let arc = 0; arc < 3; arc++) {
        const baseA = this.elapsedTime * 3.8 + (arc * Math.PI * 2) / 3;
        ctx.beginPath();
        for (let step = 0; step <= 4; step++) {
          const a = baseA + step * 0.22;
          const jitter = Math.sin(this.elapsedTime * 32 + step * 3.1 + arc) * 6;
          const px = x + Math.cos(a) * (r * 0.9 + jitter);
          const py = y + Math.sin(a) * (r * 0.9 + jitter);
          if (step === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private renderShockwaves2D(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.shockwaves.length; i++) {
      const wave = this.shockwaves[i];
      if (!wave.active) {
        continue;
      }
      const p = wave.age / wave.maxAge;
      const easeOut = 1 - Math.pow(1 - p, 3);
      const radius = Math.max(4, wave.maxRadius * easeOut);
      const alpha = (1 - p) * (1 - p);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Flash initial
      if (p < 0.35) {
        const flashAlpha = (1 - p / 0.35) * 0.75;
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      // Franges d'aberration chromatique (Cyan interne + Rouge/Magenta externe)
      const fringeOffset = Math.max(3, 8 * (1 - p) * wave.intensity);
      ctx.globalAlpha = alpha * 0.65;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(2, 6 * (1 - p));
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, Math.max(2, radius - fringeOffset), 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = Math.max(2, 6 * (1 - p));
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius + fringeOffset, 0, Math.PI * 2);
      ctx.stroke();

      // Anneau principal lumineux
      ctx.globalAlpha = alpha * 0.95;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = Math.max(2.5, (wave.isBossKo ? 14 : 9) * (1 - p));
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  private renderImpacts2D(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.impacts.length; i++) {
      const imp = this.impacts[i];
      if (!imp.active) {
        continue;
      }
      const p = imp.age / imp.maxAge;
      const easeOut = 1 - Math.pow(1 - p, 3);
      const fade = 1 - p;

      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);

      if (imp.kind === 'HIT_FLASH') {
        const flashR = 36 * imp.scale * (0.4 + 0.8 * easeOut);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(imp.x, imp.y, flashR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      // Anneau d'onde d'impact
      const ringR = (14 + 44 * easeOut) * imp.scale;
      ctx.strokeStyle = imp.kind === 'ERROR_BOUNCE' ? '#e2e8f0' : imp.color;
      ctx.lineWidth = Math.max(1.5, 5 * fade);
      if (imp.kind === 'ERROR_BOUNCE') {
        ctx.setLineDash([7, 5]);
      }
      ctx.beginPath();
      ctx.arc(imp.x, imp.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Starburst multi-pointes BD / Supercell avec contour noir encré
      const outerR = (18 + 28 * easeOut) * imp.scale;
      const innerR = outerR * (imp.kind === 'ERROR_BOUNCE' ? 0.34 : 0.46);
      drawStarburstPolygon(ctx, imp.x, imp.y, outerR, innerR, imp.points, imp.rotation);
      ctx.fillStyle = imp.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#090d16';
      ctx.stroke();

      // Coeur blanc incandescent (hit-flash interne)
      if (p < 0.45) {
        const coreScale = 1 - p / 0.45;
        drawStarburstPolygon(
          ctx,
          imp.x,
          imp.y,
          outerR * 0.56 * coreScale,
          innerR * 0.5 * coreScale,
          imp.points,
          imp.rotation + 0.2
        );
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      // Étiquette BD optionnelle (ex: "CRIT!", "CLANG!")
      if (imp.label) {
        const floatY = imp.y - (18 + 26 * easeOut) * imp.scale;
        ctx.font = `900 ${Math.round(15 * imp.scale)}px "Arial Black", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#090d16';
        ctx.strokeText(imp.label, imp.x, floatY);
        ctx.fillStyle = imp.kind === 'ERROR_BOUNCE' ? '#fecdd3' : '#fef08a';
        ctx.fillText(imp.label, imp.x, floatY);
      }

      ctx.restore();
    }
  }

  private renderSparks2D(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (!s.active) {
        continue;
      }
      const p = s.age / s.maxAge;
      const alpha = 1 - p * p;
      const size = Math.max(1.5, s.size * (1 - 0.55 * p));

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rotation);

      if (s.metallic) {
        // Éclat triangulaire de rebond métallique encré
        ctx.beginPath();
        ctx.moveTo(size * 1.3, 0);
        ctx.lineTo(-size * 0.8, -size * 0.55);
        ctx.lineTo(-size * 0.4, size * 0.6);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#090d16';
        ctx.stroke();
      } else {
        // Losange lumineux BD
        ctx.beginPath();
        ctx.moveTo(size * 1.4, 0);
        ctx.lineTo(0, -size * 0.55);
        ctx.lineTo(-size * 1.4, 0);
        ctx.lineTo(0, size * 0.55);
        ctx.closePath();
        ctx.fillStyle = s.color;
        ctx.fill();
      }

      ctx.restore();
    }
  }
}

// ============================================================================
// 3. CONTRÔLEUR TEMPS RÉEL HYBRIDE (THREE.JS WEBGL + CANVAS 2D FALLBACK)
// ============================================================================

export interface IWebGLPostFXPipelineOptions {
  scene?: THREE.Scene;
  width?: number;
  height?: number;
}

interface IActiveShockwave3D {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  age: number;
  maxAge: number;
}

export class WebGLPostFXPipeline {
  public readonly impactFX: StylizedImpactFX;

  private threeScene: THREE.Scene | null = null;
  private viewportWidth: number;
  private viewportHeight: number;
  private elapsedTime = 0;
  private disposed = false;

  // Ressources Three.js pour l'aura Super 3D
  private superHaloMesh: THREE.Mesh | null = null;
  private superHaloMaterial: THREE.ShaderMaterial | null = null;
  private worldPlaneGeo: THREE.PlaneGeometry | null = null;

  // Ondes de choc 3D actives dans la scène
  private readonly shockwaves3D: IActiveShockwave3D[] = [];

  // Passe plein écran Post-Process WebGL (optionnelle avec RenderTarget)
  private postScene: THREE.Scene | null = null;
  private postCamera: THREE.OrthographicCamera | null = null;
  private postQuadGeo: THREE.PlaneGeometry | null = null;
  private postShockwaveMaterial: THREE.ShaderMaterial | null = null;
  private postShockwaveAge = 0;
  private postShockwaveMaxAge = 0;

  constructor(options?: IWebGLPostFXPipelineOptions) {
    this.impactFX = new StylizedImpactFX();
    this.viewportWidth = Math.max(1, options?.width ?? 960);
    this.viewportHeight = Math.max(1, options?.height ?? 640);

    if (options?.scene) {
      this.attachThreeScene(options.scene);
    }
  }

  public attachThreeScene(scene: THREE.Scene): void {
    if (this.disposed) {
      return;
    }
    if (this.threeScene === scene) {
      return;
    }
    this.detachThreeScene();
    this.threeScene = scene;

    if (!this.worldPlaneGeo) {
      this.worldPlaneGeo = new THREE.PlaneGeometry(1, 1);
    }
    if (!this.superHaloMaterial) {
      this.superHaloMaterial = createSuperNeonHaloMaterial({
        charge: 0,
        intensity: 1.25,
      });
    }
    if (!this.superHaloMesh) {
      this.superHaloMesh = new THREE.Mesh(this.worldPlaneGeo, this.superHaloMaterial);
      this.superHaloMesh.rotation.x = -Math.PI / 2;
      this.superHaloMesh.position.set(0, 0.05, 0);
      this.superHaloMesh.scale.setScalar(2.6);
      this.superHaloMesh.visible = false;
      this.superHaloMesh.renderOrder = 4;
    }

    this.threeScene.add(this.superHaloMesh);
  }

  public detachThreeScene(): void {
    if (this.threeScene && this.superHaloMesh) {
      this.threeScene.remove(this.superHaloMesh);
    }
    for (let i = this.shockwaves3D.length - 1; i >= 0; i--) {
      const wave = this.shockwaves3D[i];
      if (this.threeScene) {
        this.threeScene.remove(wave.mesh);
      }
      wave.material.dispose();
    }
    this.shockwaves3D.length = 0;
    this.threeScene = null;
  }

  public setViewportSize(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    if (this.postShockwaveMaterial) {
      const uniforms = this.postShockwaveMaterial.uniforms as IKnockoutShockwaveUniforms;
      uniforms.uAspect.value = this.viewportWidth / this.viewportHeight;
    }
  }

  public spawnImpact(options: IImpactSpawnOptions): void {
    if (this.disposed) {
      return;
    }
    this.impactFX.spawnImpact(options);
  }

  public triggerShockwave(options: IShockwaveOptions): void {
    if (this.disposed) {
      return;
    }
    this.impactFX.triggerShockwave(options);

    // Synchronise aussi la passe plein écran Three.js si utilisée
    const normX = Math.max(0, Math.min(1, options.x / this.viewportWidth));
    const normY = Math.max(0, Math.min(1, 1 - options.y / this.viewportHeight));
    const duration = Math.max(0.12, options.durationSec ?? (options.isBossKo ? 0.62 : 0.42));

    this.ensurePostProcessQuad();
    if (this.postShockwaveMaterial) {
      const uniforms = this.postShockwaveMaterial.uniforms as IKnockoutShockwaveUniforms;
      uniforms.uCenter.value.set(normX, normY);
      uniforms.uProgress.value = 0;
      uniforms.uRadius.value = options.isBossKo ? 1.15 : 0.78;
      uniforms.uIntensity.value = options.intensity ?? (options.isBossKo ? 1.45 : 1.0);
      uniforms.uColor.value.set(options.color ?? '#facc15');
      uniforms.uAspect.value = this.viewportWidth / this.viewportHeight;
      this.postShockwaveAge = 0;
      this.postShockwaveMaxAge = duration;
    }
  }

  public triggerShockwave3D(
    x3d: number,
    y3d: number,
    z3d: number,
    options?: Partial<IShockwaveOptions>
  ): void {
    if (this.disposed || !this.threeScene) {
      return;
    }
    if (!this.worldPlaneGeo) {
      this.worldPlaneGeo = new THREE.PlaneGeometry(1, 1);
    }

    const duration = Math.max(0.14, options?.durationSec ?? (options?.isBossKo ? 0.6 : 0.4));
    const material = createKnockoutShockwaveMaterial({
      color: options?.color ?? '#facc15',
      intensity: options?.intensity ?? (options?.isBossKo ? 1.45 : 1.15),
      radius: 0.92,
      aspect: 1.0,
      diffuseTexture: null,
    });

    const mesh = new THREE.Mesh(this.worldPlaneGeo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x3d, Math.max(0.06, y3d), z3d);
    const worldDiameter = options?.isBossKo ? 9.5 : 5.6;
    mesh.scale.setScalar(worldDiameter);
    mesh.renderOrder = 6;
    this.threeScene.add(mesh);

    this.shockwaves3D.push({
      mesh,
      material,
      age: 0,
      maxAge: duration,
    });
  }

  public setSuperHalo(options: ISuperHaloOptions): void {
    if (this.disposed) {
      return;
    }
    this.impactFX.setSuperHalo(options);

    if (this.superHaloMesh && this.superHaloMaterial) {
      const uniforms = this.superHaloMaterial.uniforms as ISuperNeonHaloUniforms;
      const charge =
        options.chargePct !== undefined
          ? Math.max(0, Math.min(1, options.chargePct / 100))
          : options.active
          ? 1.0
          : 0.0;
      uniforms.uCharge.value = charge;
      if (options.primaryColor !== undefined) {
        uniforms.uColorPrimary.value.set(options.primaryColor);
      }
      if (options.secondaryColor !== undefined) {
        uniforms.uColorSecondary.value.set(options.secondaryColor);
      }
      this.superHaloMesh.visible = options.active && charge > 0.01;
    }
  }

  public setSuperHaloWorldPosition(x3d: number, y3d: number, z3d: number): void {
    if (this.superHaloMesh) {
      this.superHaloMesh.position.set(x3d, Math.max(0.04, y3d), z3d);
    }
  }

  public getSuperHaloMesh(): THREE.Mesh | null {
    return this.superHaloMesh;
  }

  public update(dtSec: number): void {
    if (this.disposed || dtSec <= 0) {
      return;
    }
    const dt = Math.min(dtSec, 0.1);
    this.elapsedTime += dt;
    this.impactFX.update(dt);

    if (this.superHaloMaterial) {
      const uniforms = this.superHaloMaterial.uniforms as ISuperNeonHaloUniforms;
      uniforms.uTime.value = this.elapsedTime;
    }

    for (let i = this.shockwaves3D.length - 1; i >= 0; i--) {
      const wave = this.shockwaves3D[i];
      wave.age += dt;
      if (wave.age >= wave.maxAge) {
        if (this.threeScene) {
          this.threeScene.remove(wave.mesh);
        }
        wave.material.dispose();
        this.shockwaves3D.splice(i, 1);
        continue;
      }
      const uniforms = wave.material.uniforms as IKnockoutShockwaveUniforms;
      uniforms.uTime.value = this.elapsedTime;
      uniforms.uProgress.value = wave.age / wave.maxAge;
    }

    if (this.postShockwaveMaterial && this.postShockwaveMaxAge > 0) {
      this.postShockwaveAge += dt;
      const uniforms = this.postShockwaveMaterial.uniforms as IKnockoutShockwaveUniforms;
      uniforms.uTime.value = this.elapsedTime;
      if (this.postShockwaveAge >= this.postShockwaveMaxAge) {
        uniforms.uProgress.value = 1;
        this.postShockwaveMaxAge = 0;
      } else {
        uniforms.uProgress.value = this.postShockwaveAge / this.postShockwaveMaxAge;
      }
    }
  }

  public renderOverlay2D(ctx: CanvasRenderingContext2D): void {
    if (this.disposed) {
      return;
    }
    this.impactFX.renderOverlay2D(ctx, this.viewportWidth, this.viewportHeight);
  }

  public renderThreePostProcess(
    renderer: THREE.WebGLRenderer,
    sourceTexture: THREE.Texture,
    target: THREE.WebGLRenderTarget | null = null
  ): void {
    if (this.disposed) {
      return;
    }
    this.ensurePostProcessQuad();
    if (!this.postScene || !this.postCamera || !this.postShockwaveMaterial) {
      return;
    }

    const uniforms = this.postShockwaveMaterial.uniforms as IKnockoutShockwaveUniforms;
    uniforms.tDiffuse.value = sourceTexture;
    uniforms.uHasTexture.value = 1.0;

    if (this.postShockwaveMaxAge <= 0) {
      uniforms.uIntensity.value = 0.0;
    }

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(this.postScene, this.postCamera);
    renderer.setRenderTarget(prevTarget);
  }

  public getScreenShakeOffset(): { x: number; y: number } {
    return this.impactFX.getScreenShakeOffset();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.detachThreeScene();
    this.impactFX.clear();

    this.superHaloMaterial?.dispose();
    this.postShockwaveMaterial?.dispose();
    this.worldPlaneGeo?.dispose();
    this.postQuadGeo?.dispose();

    this.superHaloMaterial = null;
    this.superHaloMesh = null;
    this.postShockwaveMaterial = null;
    this.postScene = null;
    this.postCamera = null;
    this.worldPlaneGeo = null;
    this.postQuadGeo = null;
  }

  private ensurePostProcessQuad(): void {
    if (this.postScene) {
      return;
    }
    if (!this.postQuadGeo) {
      this.postQuadGeo = new THREE.PlaneGeometry(2, 2);
    }
    this.postShockwaveMaterial = new THREE.ShaderMaterial({
      uniforms: KnockoutShockwaveShader.createUniforms({
        aspect: this.viewportWidth / this.viewportHeight,
        intensity: 0,
      }),
      vertexShader: KnockoutShockwaveShader.vertexShader,
      fragmentShader: KnockoutShockwaveShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const postQuad = new THREE.Mesh(this.postQuadGeo, this.postShockwaveMaterial);
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene.add(postQuad);
  }
}
