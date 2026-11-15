import * as THREE from 'three';

type ParticleKind = 'SPARK' | 'RING' | 'FLASH' | 'DUST';

interface IParticle3D {
  kind: ParticleKind;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  rotSpeedX: number;
  rotSpeedY: number;
  rotSpeedZ: number;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
}

interface ISpawnParticleConfig {
  kind: ParticleKind;
  geometry: THREE.BufferGeometry;
  x: number;
  y: number;
  z: number;
  colorHex: number;
  additive: boolean;
  doubleSide?: boolean;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  drag: number;
  rotSpeedX?: number;
  rotSpeedY?: number;
  rotSpeedZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
}

const MAX_ACTIVE_PARTICLES = 240;
const DUST_PALETTE = [0xf5f5f4, 0xe7e5e4, 0xfef3c7] as const;
const WHITE_COLOR = new THREE.Color(0xffffff);
const SCRATCH_COLOR = new THREE.Color();

function brightenColor(colorHex: number, whiteMix: number): number {
  SCRATCH_COLOR.setHex(colorHex).lerp(WHITE_COLOR, whiteMix);
  return SCRATCH_COLOR.getHex();
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Système de particules 3D temps réel style Brawl Stars (impacts, ondes de Super, poussière de course).
 */
export class ParticleSystem3D {
  private readonly scene: THREE.Scene;
  private readonly particles: IParticle3D[] = [];
  private readonly sparkGeo: THREE.OctahedronGeometry;
  private readonly puffGeo: THREE.IcosahedronGeometry;
  private readonly cubeGeo: THREE.BoxGeometry;
  private readonly ringGeo: THREE.RingGeometry;
  private readonly flashGeo: THREE.SphereGeometry;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
    this.puffGeo = new THREE.IcosahedronGeometry(0.16, 1);
    this.cubeGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.ringGeo = new THREE.RingGeometry(0.64, 1.0, 32);
    this.flashGeo = new THREE.SphereGeometry(0.32, 12, 10);
  }

  /**
   * Déclenche une gerbe d'éclats lumineux + flash d'impact en 3D.
   */
  public spawnHitBurst(
    x3d: number,
    y3d: number,
    z3d: number,
    colorHex: number,
    count = 14
  ): void {
    if (this.disposed) {
      return;
    }

    const safeCount = Math.max(0, Math.floor(count));
    const brightTint = brightenColor(colorHex, 0.5);

    // Flash central instantané
    this.spawnParticle({
      kind: 'FLASH',
      geometry: this.flashGeo,
      x: x3d,
      y: y3d,
      z: z3d,
      colorHex: brightTint,
      additive: true,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      drag: 0,
      maxAge: 0.16,
      startScale: 0.36,
      endScale: 1.7,
      startOpacity: 0.9,
    });

    // Mini onde d'impact horizontale
    this.spawnParticle({
      kind: 'RING',
      geometry: this.ringGeo,
      x: x3d,
      y: Math.max(0.08, y3d),
      z: z3d,
      colorHex,
      additive: true,
      doubleSide: true,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      drag: 0,
      rotX: -Math.PI / 2,
      maxAge: 0.24,
      startScale: 0.22,
      endScale: 1.55,
      startOpacity: 0.85,
    });

    // Éclats facettés radiaux
    for (let i = 0; i < safeCount; i++) {
      const angle = (i / Math.max(1, safeCount)) * Math.PI * 2 + randomRange(-0.28, 0.28);
      const horizontalSpeed = randomRange(2.8, 7.6);
      const useCube = i % 3 === 0;

      this.spawnParticle({
        kind: 'SPARK',
        geometry: useCube ? this.cubeGeo : this.sparkGeo,
        x: x3d + randomRange(-0.1, 0.1),
        y: y3d + randomRange(-0.08, 0.12),
        z: z3d + randomRange(-0.1, 0.1),
        colorHex: i % 2 === 0 ? colorHex : brightTint,
        additive: true,
        vx: Math.cos(angle) * horizontalSpeed,
        vy: randomRange(1.8, 5.8),
        vz: Math.sin(angle) * horizontalSpeed,
        gravity: -13.5,
        drag: 2.2,
        rotSpeedX: randomRange(-12, 12),
        rotSpeedY: randomRange(-12, 12),
        rotSpeedZ: randomRange(-12, 12),
        maxAge: randomRange(0.28, 0.48),
        startScale: randomRange(0.85, 1.38),
        endScale: 0.05,
        startOpacity: 0.95,
      });
    }
  }

  /**
   * Déclenche une onde de choc Super au sol avec anneaux concentriques et étincelles ascendantes.
   */
  public spawnSuperShockwave(x3d: number, z3d: number, colorHex: number): void {
    if (this.disposed) {
      return;
    }

    const brightTint = brightenColor(colorHex, 0.62);

    // Onde principale au sol
    this.spawnParticle({
      kind: 'RING',
      geometry: this.ringGeo,
      x: x3d,
      y: 0.08,
      z: z3d,
      colorHex,
      additive: true,
      doubleSide: true,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      drag: 0,
      rotX: -Math.PI / 2,
      maxAge: 0.56,
      startScale: 0.45,
      endScale: 4.6,
      startOpacity: 0.95,
    });

    // Onde secondaire rapide haute luminosité
    this.spawnParticle({
      kind: 'RING',
      geometry: this.ringGeo,
      x: x3d,
      y: 0.11,
      z: z3d,
      colorHex: brightTint,
      additive: true,
      doubleSide: true,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      drag: 0,
      rotX: -Math.PI / 2,
      maxAge: 0.38,
      startScale: 0.25,
      endScale: 3.25,
      startOpacity: 0.92,
    });

    // Flash énergétique au centre
    this.spawnParticle({
      kind: 'FLASH',
      geometry: this.flashGeo,
      x: x3d,
      y: 0.26,
      z: z3d,
      colorHex: brightTint,
      additive: true,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      drag: 0,
      maxAge: 0.25,
      startScale: 0.55,
      endScale: 2.75,
      startOpacity: 0.85,
    });

    // Gerbe d'étincelles montantes en couronne
    const sparkCount = 24;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2 + randomRange(-0.12, 0.12);
      const startRadius = randomRange(0.4, 0.95);
      const radialSpeed = randomRange(2.4, 5.4);

      this.spawnParticle({
        kind: 'SPARK',
        geometry: i % 4 === 0 ? this.cubeGeo : this.sparkGeo,
        x: x3d + Math.cos(angle) * startRadius,
        y: randomRange(0.14, 0.32),
        z: z3d + Math.sin(angle) * startRadius,
        colorHex: i % 2 === 0 ? brightTint : colorHex,
        additive: true,
        vx: Math.cos(angle) * radialSpeed,
        vy: randomRange(5.0, 10.2),
        vz: Math.sin(angle) * radialSpeed,
        gravity: -10.5,
        drag: 1.4,
        rotSpeedX: randomRange(-10, 10),
        rotSpeedY: randomRange(-10, 10),
        rotSpeedZ: randomRange(-10, 10),
        maxAge: randomRange(0.44, 0.82),
        startScale: randomRange(0.95, 1.5),
        endScale: 0.05,
        startOpacity: 0.95,
      });
    }
  }

  /**
   * Génère de petits nuages de poussière stylisés sous les pieds pendant la course.
   */
  public spawnDustTrail(x3d: number, z3d: number): void {
    if (this.disposed) {
      return;
    }

    const puffCount = 2;
    for (let i = 0; i < puffCount; i++) {
      const tint = DUST_PALETTE[Math.floor(Math.random() * DUST_PALETTE.length)];
      const useCube = Math.random() < 0.35;

      this.spawnParticle({
        kind: 'DUST',
        geometry: useCube ? this.cubeGeo : this.puffGeo,
        x: x3d + randomRange(-0.18, 0.18),
        y: randomRange(0.08, 0.16),
        z: z3d + randomRange(-0.18, 0.18),
        colorHex: tint,
        additive: false,
        vx: randomRange(-0.75, 0.75),
        vy: randomRange(0.75, 1.45),
        vz: randomRange(-0.75, 0.75),
        gravity: -0.6,
        drag: 3.4,
        rotSpeedX: randomRange(-4, 4),
        rotSpeedY: randomRange(-4, 4),
        rotSpeedZ: randomRange(-4, 4),
        maxAge: randomRange(0.28, 0.42),
        startScale: 0.42,
        endScale: 1.08,
        startOpacity: 0.62,
      });
    }
  }

  /**
   * Met à jour la physique, l'échelle et la transparence de toutes les particules actives.
   */
  public update(dtSec: number): void {
    if (this.disposed || dtSec <= 0) {
      return;
    }

    const dt = Math.min(dtSec, 0.1);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;

      if (p.age >= p.maxAge) {
        this.disposeParticleAt(i);
        continue;
      }

      const t = p.age / p.maxAge;
      const damping = p.drag > 0 ? Math.exp(-p.drag * dt) : 1;

      p.vy += p.gravity * dt;
      p.vx *= damping;
      p.vy *= damping;
      p.vz *= damping;

      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      // Rebond doux des étincelles sur le sol de l'arène
      if (p.kind === 'SPARK' && p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vy = Math.abs(p.vy) * 0.35;
      }

      p.mesh.rotation.x += p.rotSpeedX * dt;
      p.mesh.rotation.y += p.rotSpeedY * dt;
      p.mesh.rotation.z += p.rotSpeedZ * dt;

      if (p.kind === 'RING') {
        const ease = 1 - (1 - t) * (1 - t);
        const scale = p.startScale + (p.endScale - p.startScale) * ease;
        p.mesh.scale.setScalar(scale);
        p.material.opacity = p.startOpacity * (1 - t) * (1 - t);
      } else if (p.kind === 'FLASH') {
        const ease = 1 - Math.pow(1 - t, 3);
        const scale = p.startScale + (p.endScale - p.startScale) * ease;
        p.mesh.scale.setScalar(scale);
        p.material.opacity = p.startOpacity * (1 - t);
      } else if (p.kind === 'DUST') {
        const grow = t < 0.3 ? t / 0.3 : 1;
        const shrink = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
        const scale = (p.startScale + (p.endScale - p.startScale) * grow) * shrink;
        p.mesh.scale.setScalar(Math.max(0.01, scale));
        p.material.opacity = p.startOpacity * (1 - t);
      } else {
        const scale = p.startScale + (p.endScale - p.startScale) * (t * t);
        p.mesh.scale.setScalar(Math.max(0.01, scale));
        p.material.opacity = p.startOpacity * (1 - t * t);
      }
    }
  }

  /**
   * Supprime toutes les particules actives et libère les géométries partagées.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.disposeParticleAt(i);
    }

    this.sparkGeo.dispose();
    this.puffGeo.dispose();
    this.cubeGeo.dispose();
    this.ringGeo.dispose();
    this.flashGeo.dispose();
  }

  private spawnParticle(config: ISpawnParticleConfig): void {
    if (this.particles.length >= MAX_ACTIVE_PARTICLES) {
      this.disposeParticleAt(0);
    }

    const material = new THREE.MeshBasicMaterial({
      color: config.colorHex,
      transparent: true,
      opacity: config.startOpacity,
      depthWrite: false,
      blending: config.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: config.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(config.geometry, material);
    mesh.position.set(config.x, config.y, config.z);
    mesh.scale.setScalar(config.startScale);
    if (config.rotX !== undefined) {
      mesh.rotation.x = config.rotX;
    }
    if (config.rotY !== undefined) {
      mesh.rotation.y = config.rotY;
    }
    if (config.rotZ !== undefined) {
      mesh.rotation.z = config.rotZ;
    }
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    this.scene.add(mesh);
    this.particles.push({
      kind: config.kind,
      mesh,
      material,
      vx: config.vx,
      vy: config.vy,
      vz: config.vz,
      gravity: config.gravity,
      drag: config.drag,
      rotSpeedX: config.rotSpeedX ?? 0,
      rotSpeedY: config.rotSpeedY ?? 0,
      rotSpeedZ: config.rotSpeedZ ?? 0,
      age: 0,
      maxAge: config.maxAge,
      startScale: config.startScale,
      endScale: config.endScale,
      startOpacity: config.startOpacity,
    });
  }

  private disposeParticleAt(index: number): void {
    const particle = this.particles[index];
    this.scene.remove(particle.mesh);
    particle.material.dispose();
    this.particles.splice(index, 1);
  }
}
