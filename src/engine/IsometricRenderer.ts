import * as THREE from 'three';
import type { BrawlerId, GameModeId } from '../types/cctp';
import {
  animateBrawler3DRig,
  createBrawler3DModel,
  createTarget3DModel,
  disposeObject3D,
  type IBrawler3DRig,
} from '../entities/Brawler3DModel';
import { buildArenaEnvironment3D, updateArenaEnvironment3D } from './ArenaEnvironment3D';
import { ParticleSystem3D } from './ParticleSystem3D';

export const ISO_ANGLE_DEG = 50;
export const ISO_ANGLE_RAD = (ISO_ANGLE_DEG * Math.PI) / 180;
/** Facteur de compression verticale dû à la caméra inclinée à 50° */
export const ISO_Y_SCALE = Math.cos(ISO_ANGLE_RAD);
/** +35% de visibilité vers le haut de l'écran (sens naturel d'attaque bas -> haut) */
export const UPWARD_VISIBILITY_BIAS = 0.35;

/** Conversion entre coordonnées arène (960x640) et unités Three.js (24x16) */
const WORLD_SCALE_3D = 1 / 40;

export interface IRenderVec2 {
  x: number;
  y: number;
}

export interface IRenderObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'wall' | 'desk' | 'bush' | 'goal_left' | 'goal_right' | 'safe_zone';
  label?: string;
}

export interface IRenderTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  isCorrect: boolean;
  hp: number;
  maxHp: number;
  highlighted: boolean;
  isCrystal?: boolean;
  isBoss?: boolean;
  frozen?: boolean;
  slowed?: boolean;
  hitFlashMs?: number;
}

export interface IRenderProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isLobbed?: boolean;
  heightZ?: number;
}

export interface IRenderPlayer {
  x: number;
  y: number;
  aimAngle: number;
  brawlerId: BrawlerId;
  name: string;
  hp: number;
  maxHp: number;
  ammoBars: number;
  maxAmmoBars: number;
  superGaugePct: number;
  gadgetCharges: number;
  shieldHp: number;
  errorShieldRemainingMs: number;
  penaltyCooldownMs: number;
  comboMultiplier: number;
  isAiming?: boolean;
  isCancellingAim?: boolean;
  attackRange?: number;
  isStealthed?: boolean;
  isRespawning?: boolean;
  respawnRemainingMs?: number;
}

export interface IRenderJoystick {
  active: boolean;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  color: string;
}

export interface IRenderFlashBubble {
  text: string;
  x: number;
  y: number;
  remainingMs: number;
  isPositive?: boolean;
}

export interface IRenderFrameState {
  modeId: GameModeId;
  arenaWidth: number;
  arenaHeight: number;
  player: IRenderPlayer;
  targets: IRenderTarget[];
  projectiles: IRenderProjectile[];
  obstacles: IRenderObstacle[];
  hudPrompt: string;
  objectiveScore: number;
  objectiveLabel: string;
  remainingSeconds: number;
  shrinkRadius?: number;
  laserSweepY?: number;
  safeCorridorIndex?: number;
  bossState?: { name: string; hp: number; maxHp: number };
  turretPos?: IRenderVec2 | null;
  compassTargetPos?: IRenderVec2 | null;
  flashBubble: IRenderFlashBubble | null;
  floatingBubbles?: IRenderFlashBubble[];
  reflexRemainingRatio?: number;
  droppedCrystals?: Array<{ id: string; x: number; y: number }>;
  arenaBall?: { x: number; y: number; radius: number };
  energyCrates?: Array<{ id: string; x: number; y: number; hp: number; maxHp: number }>;
  alivePlayersCount?: number;
  chatterDrones?: Array<{ id: string; x: number; y: number; radius: number }>;
  capturePct?: number;
  inkPuddles?: Array<{ x: number; y: number; radius: number; remainingMs: number }>;
  rivalBot?: { x: number; y: number; label: string; hp: number; maxHp: number } | null;
  rushBannerText?: string | null;
  shakeIntensity?: number;
  leftStick: IRenderJoystick;
  rightStick: IRenderJoystick;
}

const BRAWLER_COLORS: Record<BrawlerId, { primary: string; accent: string }> = {
  TIMO: { primary: '#facc15', accent: '#2563eb' },
  LEO: { primary: '#312e81', accent: '#a855f7' },
  MAYA: { primary: '#4d7c0f', accent: '#f59e0b' },
  ZACK: { primary: '#06b6d4', accent: '#ec4899' },
};

interface ICachedTarget3D {
  group: THREE.Group;
  kind: 'drone' | 'crystal' | 'boss';
  halo: THREE.Mesh;
}

/**
 * Moteur de rendu hybride 60 FPS :
 * - Scène 3D temps réel Three.js (modèles Chibi 3D des 4 Héros, drones/cristaux/boss 3D, arène 3D à 50°)
 * - Superposition 2D Canvas haute lisibilité (étiquettes de réponses, barres de PV/munitions, joysticks, HUD)
 * - Fallback automatique 2D si WebGL est indisponible.
 */
export class IsometricRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 1;

  // Sous-système 3D Three.js
  private webglReady = false;
  private webglCanvas: HTMLCanvasElement | null = null;
  private webglRenderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera3D: THREE.OrthographicCamera | null = null;
  private arenaGroup: THREE.Group | null = null;
  private arenaEnvGroup: THREE.Group | null = null;
  private builtArenaKey = '';

  private playerRig: IBrawler3DRig | null = null;
  private prevPlayerX = 0;
  private prevPlayerY = 0;
  private moveHoldMs = 0;
  private lastRenderMs = performance.now();
  private currentTimeSec = 0;

  private readonly targetMeshes = new Map<string, ICachedTarget3D>();
  private readonly projectilePool: THREE.Mesh[] = [];
  private readonly projectileGeo = new THREE.SphereGeometry(0.24, 10, 10);
  private turretMesh3D: THREE.Group | null = null;
  private particleSystem: ParticleSystem3D | null = null;
  private dustSpawnCooldownMs = 0;
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.6);

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Impossible d’initialiser le contexte 2D Canvas.');
    }
    this.ctx = context;
    this.initThreeSubsystem();
  }

  private initThreeSubsystem(): void {
    try {
      const offscreen = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({
        canvas: offscreen,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);

      const hemiLight = new THREE.HemisphereLight(0xfef9c3, 0x1e293b, 1.15);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
      sunLight.position.set(22, 32, 22);
      sunLight.target.position.set(12, 0, 8);
      scene.add(sunLight.target);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 75;
      sunLight.shadow.camera.left = -24;
      sunLight.shadow.camera.right = 24;
      sunLight.shadow.camera.top = 24;
      sunLight.shadow.camera.bottom = -24;
      sunLight.shadow.bias = -0.0005;
      scene.add(sunLight);

      const camera = new THREE.OrthographicCamera(-12, 12, 7, -7, 0.1, 140);
      const arenaGroup = new THREE.Group();
      scene.add(arenaGroup);

      // Tourelle 3D "Le Grand Robert" (Léo Super)
      const turretGroup = new THREE.Group();
      const turretBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.55, 0.65, 14),
        new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.4 })
      );
      turretBase.position.y = 0.35;
      const bookTop = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.25, 0.65),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xd97706, emissiveIntensity: 0.3 })
      );
      bookTop.position.y = 0.85;
      turretGroup.add(turretBase, bookTop);
      turretGroup.visible = false;
      scene.add(turretGroup);

      this.webglCanvas = offscreen;
      const parent = this.canvas.parentElement;
      if (parent) {
        offscreen.style.position = 'absolute';
        offscreen.style.inset = '0';
        offscreen.style.width = '100%';
        offscreen.style.height = '100%';
        offscreen.style.pointerEvents = 'none';
        offscreen.style.zIndex = '1';
        offscreen.style.display = 'block';
        parent.insertBefore(offscreen, this.canvas);

        this.canvas.style.position = 'relative';
        this.canvas.style.zIndex = '2';
        this.canvas.style.background = 'transparent';
        this.canvas.style.display = 'block';
      }
      this.webglRenderer = renderer;
      this.scene = scene;
      this.camera3D = camera;
      this.arenaGroup = arenaGroup;
      this.turretMesh3D = turretGroup;
      this.particleSystem = new ParticleSystem3D(scene);
      this.webglReady = true;
    } catch {
      this.webglReady = false;
    }
  }

  public getScene(): THREE.Scene | null {
    return this.scene;
  }

  public getWorldScale3D(): number {
    return WORLD_SCALE_3D;
  }

  public spawnHitBurst(wx: number, wy: number, colorHex: number, count = 14): void {
    this.particleSystem?.spawnHitBurst(
      wx * WORLD_SCALE_3D,
      0.75,
      wy * WORLD_SCALE_3D,
      colorHex,
      count
    );
  }

  public spawnSuperShockwave(wx: number, wy: number, colorHex: number): void {
    this.particleSystem?.spawnSuperShockwave(
      wx * WORLD_SCALE_3D,
      wy * WORLD_SCALE_3D,
      colorHex
    );
  }

  public dispose(): void {
    this.particleSystem?.dispose();
    this.particleSystem = null;
    if (this.playerRig && this.scene) {
      this.scene.remove(this.playerRig.root);
      disposeObject3D(this.playerRig.root);
      this.playerRig = null;
    }
    for (const cached of this.targetMeshes.values()) {
      this.scene?.remove(cached.group);
      disposeObject3D(cached.group);
    }
    this.targetMeshes.clear();
    for (const p of this.projectilePool) {
      this.scene?.remove(p);
      (p.material as THREE.Material).dispose();
    }
    this.projectilePool.length = 0;
    this.projectileGeo.dispose();

    if (this.scene) {
      disposeObject3D(this.scene);
    }
    if (this.webglCanvas?.parentElement) {
      this.webglCanvas.parentElement.removeChild(this.webglCanvas);
    }
    this.webglRenderer?.dispose();
    this.webglRenderer = null;
    this.webglCanvas = null;
    this.scene = null;
    this.camera3D = null;
    this.arenaGroup = null;
    this.arenaEnvGroup = null;
    this.webglReady = false;
  }

  /**
   * Adapte la résolution interne du canvas en mode Paysage (16:9 ou 4:3)
   * avec prise en charge HiDPI sans dépasser 2x pour maintenir 60 FPS.
   */
  public resizeToContainer(): void {
    const parent = this.canvas.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(640, Math.floor(width));
    const targetH = Math.max(360, Math.floor(height));

    if (this.canvas.width !== targetW * dpr || this.canvas.height !== targetH * dpr) {
      this.canvas.width = targetW * dpr;
      this.canvas.height = targetH * dpr;
      this.canvas.style.width = `${targetW}px`;
      this.canvas.style.height = `${targetH}px`;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zoom = Math.min(targetW / 960, targetH / 540);

    if (this.webglReady && this.webglRenderer) {
      this.webglRenderer.setPixelRatio(dpr);
      this.webglRenderer.setSize(targetW, targetH, false);
      if (this.webglCanvas && this.webglCanvas.parentElement) {
        this.webglCanvas.style.width = `${targetW}px`;
        this.webglCanvas.style.height = `${targetH}px`;
      }
    }
  }

  /**
   * Projection isométrique 50° : alignée pixel-pour-pixel sur la caméra Three.js lorsque WebGL est actif.
   */
  public worldToScreen(wx: number, wy: number, wz = 0): IRenderVec2 {
    const cssW = this.canvas.clientWidth || 960;
    const cssH = this.canvas.clientHeight || 540;

    if (this.webglReady && this.camera3D) {
      const vec = new THREE.Vector3(
        wx * WORLD_SCALE_3D,
        wz * WORLD_SCALE_3D,
        wy * WORLD_SCALE_3D
      );
      vec.project(this.camera3D);
      return {
        x: (vec.x * 0.5 + 0.5) * cssW,
        y: (-vec.y * 0.5 + 0.5) * cssH,
      };
    }

    const playerBiasY = cssH * (0.5 + UPWARD_VISIBILITY_BIAS * 0.42);
    const dx = (wx - (this.cameraX + this.shakeOffsetX)) * this.zoom;
    const dy = (wy - (this.cameraY + this.shakeOffsetY)) * ISO_Y_SCALE * this.zoom - wz * this.zoom;

    return {
      x: cssW * 0.5 + dx,
      y: playerBiasY + dy,
    };
  }

  public screenToWorld(sx: number, sy: number): IRenderVec2 {
    const cssW = this.canvas.clientWidth || 960;
    const cssH = this.canvas.clientHeight || 540;

    if (this.webglReady && this.camera3D) {
      const ndc = new THREE.Vector2((sx / cssW) * 2 - 1, -(sy / cssH) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera3D);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.aimPlane, hit)) {
        return {
          x: hit.x / WORLD_SCALE_3D,
          y: hit.z / WORLD_SCALE_3D,
        };
      }
    }

    const playerBiasY = cssH * (0.5 + UPWARD_VISIBILITY_BIAS * 0.42);
    const wx = this.cameraX + (sx - cssW * 0.5) / this.zoom;
    const wy = this.cameraY + (sy - playerBiasY) / (ISO_Y_SCALE * this.zoom);
    return { x: wx, y: wy };
  }

  public render(state: IRenderFrameState): void {
    const cssW = this.canvas.clientWidth || 960;
    const cssH = this.canvas.clientHeight || 540;
    const nowMs = performance.now();
    const dtMs = Math.max(1, nowMs - this.lastRenderMs);
    this.lastRenderMs = nowMs;
    this.currentTimeSec = nowMs / 1000;

    // Caméra verrouillée sur le joueur avec léger lissage
    this.cameraX += (state.player.x - this.cameraX) * 0.18;
    this.cameraY += (state.player.y - this.cameraY) * 0.18;

    // Tremblement de caméra sur impact / erreur / super
    const shakeAmp = state.shakeIntensity ?? 0;
    if (shakeAmp > 0.05) {
      this.shakeOffsetX = (Math.random() - 0.5) * 2 * shakeAmp;
      this.shakeOffsetY = (Math.random() - 0.5) * 2 * shakeAmp;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    const movedDist = Math.hypot(
      state.player.x - this.prevPlayerX,
      state.player.y - this.prevPlayerY
    );
    this.prevPlayerX = state.player.x;
    this.prevPlayerY = state.player.y;
    if (movedDist > 0.35) {
      this.moveHoldMs = 110;
    } else {
      this.moveHoldMs = Math.max(0, this.moveHoldMs - dtMs);
    }

    this.dustSpawnCooldownMs = Math.max(0, this.dustSpawnCooldownMs - dtMs);
    if (this.webglReady && movedDist > 0.45 && this.dustSpawnCooldownMs <= 0) {
      this.particleSystem?.spawnDustTrail(
        state.player.x * WORLD_SCALE_3D,
        state.player.y * WORLD_SCALE_3D
      );
      this.dustSpawnCooldownMs = 85;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, cssW, cssH);

    if (this.webglReady && this.webglRenderer && this.scene && this.camera3D && this.webglCanvas) {
      this.renderThreeScene(state, cssW, cssH, this.currentTimeSec, dtMs / 1000);
      // En dual-canvas monté dans le DOM, webglCanvas est déjà derrière : zéro copie GPU->CPU
      if (!this.webglCanvas.parentElement) {
        ctx.drawImage(this.webglCanvas, 0, 0, cssW, cssH);
      }
      this.draw2DOverlaysOn3D(state);
    } else {
      this.render2DFallback(state, cssW, cssH);
    }

    this.drawJoysticks(state.leftStick, state.rightStick, state.player.isCancellingAim);
    this.drawHudOverlay(state, cssW);
  }

  private renderThreeScene(
    state: IRenderFrameState,
    cssW: number,
    cssH: number,
    timeSec: number,
    dtSec: number
  ): void {
    if (!this.scene || !this.camera3D || !this.webglRenderer) return;

    // Mise à jour caméra orthographique inclinée à 50° (+35% de visibilité vers le haut)
    const viewW3d = cssW / (40 * this.zoom);
    const viewH3d = cssH / (40 * this.zoom);
    this.camera3D.left = -viewW3d * 0.5;
    this.camera3D.right = viewW3d * 0.5;
    this.camera3D.top = viewH3d * 0.5;
    this.camera3D.bottom = -viewH3d * 0.5;
    this.camera3D.updateProjectionMatrix();

    const upwardBias3d = (viewH3d * UPWARD_VISIBILITY_BIAS * 0.42) / Math.sin(ISO_ANGLE_RAD);
    const lookX = (this.cameraX + this.shakeOffsetX) * WORLD_SCALE_3D;
    const lookZ = (this.cameraY + this.shakeOffsetY) * WORLD_SCALE_3D - upwardBias3d;
    const camDist = 36;
    this.camera3D.position.set(
      lookX,
      camDist * Math.sin(ISO_ANGLE_RAD),
      lookZ + camDist * Math.cos(ISO_ANGLE_RAD)
    );
    this.camera3D.lookAt(lookX, 0, lookZ);
    this.camera3D.updateMatrixWorld();

    // Sol & obstacles 3D (reconstruits uniquement au changement de mode ou de carte)
    const obsSig = state.obstacles
      .map((o) => `${o.kind[0]}${Math.round(o.x)},${Math.round(o.y)}`)
      .join(';');
    const arenaKey = `${state.modeId}_${state.arenaWidth}x${state.arenaHeight}_${obsSig}`;
    if (this.builtArenaKey !== arenaKey) {
      this.rebuildArena3D(state);
      this.builtArenaKey = arenaKey;
    }

    if (this.arenaEnvGroup) {
      updateArenaEnvironment3D(this.arenaEnvGroup, timeSec, {
        shrinkRadius3d:
          state.shrinkRadius !== undefined ? state.shrinkRadius * WORLD_SCALE_3D : undefined,
        laserSweepZ3d:
          state.laserSweepY !== undefined ? state.laserSweepY * WORLD_SCALE_3D : undefined,
      });
    }

    // Héros 3D Chibi
    if (!this.playerRig || this.playerRig.brawlerId !== state.player.brawlerId) {
      if (this.playerRig) {
        this.scene.remove(this.playerRig.root);
        disposeObject3D(this.playerRig.root);
      }
      this.playerRig = createBrawler3DModel(state.player.brawlerId);
      this.scene.add(this.playerRig.root);
    }

    this.playerRig.root.position.set(
      state.player.x * WORLD_SCALE_3D,
      0,
      state.player.y * WORLD_SCALE_3D
    );
    animateBrawler3DRig(this.playerRig, {
      timeSec,
      isMoving: this.moveHoldMs > 0,
      aimAngle: state.player.aimAngle,
      superReady: state.player.superGaugePct >= 100,
      hasShield: state.player.shieldHp > 0 || state.player.errorShieldRemainingMs > 0,
      isErrorShield: state.player.errorShieldRemainingMs > 0 && state.player.shieldHp <= 0,
    });

    // Tourelle 3D de Léo
    if (this.turretMesh3D) {
      if (state.turretPos) {
        this.turretMesh3D.visible = true;
        this.turretMesh3D.position.set(
          state.turretPos.x * WORLD_SCALE_3D,
          0,
          state.turretPos.y * WORLD_SCALE_3D
        );
        this.turretMesh3D.rotation.y = timeSec * 1.8;
      } else {
        this.turretMesh3D.visible = false;
      }
    }

    // Cibles 3D (drones, cristaux, boss)
    const activeIds = new Set<string>();
    for (const t of state.targets) {
      activeIds.add(t.id);
      const desiredKind: 'drone' | 'crystal' | 'boss' = t.isBoss
        ? 'boss'
        : t.isCrystal
          ? 'crystal'
          : 'drone';
      let cached = this.targetMeshes.get(t.id);
      if (!cached || cached.kind !== desiredKind) {
        if (cached) {
          this.scene.remove(cached.group);
          disposeObject3D(cached.group);
        }
        const group = createTarget3DModel(desiredKind);
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.75, 0.96, 24),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
        );
        halo.rotation.x = -Math.PI / 2;
        halo.position.y = 0.05;
        halo.visible = false;
        group.add(halo);
        this.scene.add(group);
        cached = { group, kind: desiredKind, halo };
        this.targetMeshes.set(t.id, cached);
      }

      cached.group.position.set(t.x * WORLD_SCALE_3D, 0, t.y * WORLD_SCALE_3D);
      cached.group.rotation.y = timeSec * (t.isCrystal ? 1.8 : 1.1);
      cached.halo.visible = t.highlighted;
    }

    for (const [id, cached] of this.targetMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(cached.group);
        disposeObject3D(cached.group);
        this.targetMeshes.delete(id);
      }
    }

    // Projectiles 3D
    while (this.projectilePool.length < state.projectiles.length) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xfacc15,
        emissiveIntensity: 0.65,
      });
      const mesh = new THREE.Mesh(this.projectileGeo, mat);
      this.scene.add(mesh);
      this.projectilePool.push(mesh);
    }
    for (let i = 0; i < this.projectilePool.length; i++) {
      const mesh = this.projectilePool[i];
      if (i < state.projectiles.length) {
        const p = state.projectiles[i];
        mesh.visible = true;
        mesh.position.set(
          p.x * WORLD_SCALE_3D,
          (p.heightZ ?? 24) * WORLD_SCALE_3D,
          p.y * WORLD_SCALE_3D
        );
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(p.color);
        mat.emissive.set(p.color);
      } else {
        mesh.visible = false;
      }
    }

    this.particleSystem?.update(dtSec);

    this.webglRenderer.render(this.scene, this.camera3D);
  }

  private rebuildArena3D(state: IRenderFrameState): void {
    if (!this.arenaGroup) return;
    while (this.arenaGroup.children.length > 0) {
      const child = this.arenaGroup.children[0];
      this.arenaGroup.remove(child);
      disposeObject3D(child);
    }

    const w3d = state.arenaWidth * WORLD_SCALE_3D;
    const h3d = state.arenaHeight * WORLD_SCALE_3D;
    const envGroup = buildArenaEnvironment3D(
      state.modeId,
      w3d,
      h3d,
      state.obstacles,
      WORLD_SCALE_3D
    );
    this.arenaGroup.add(envGroup);
    this.arenaEnvGroup = envGroup;
  }

  private draw2DOverlaysOn3D(state: IRenderFrameState): void {
    this.drawSharedWorldOverlays(state);
    for (const obs of state.obstacles) {
      if (!obs.label) continue;
      this.drawObstacleLabelBadge(obs);
    }
    const labelOffsets = this.computeTargetLabelOffsets(state.targets);
    for (const target of state.targets) {
      this.drawTargetOverlay(target, labelOffsets.get(target.id) ?? 0);
    }
    this.drawPlayerOverlay(state.player);
    this.drawActiveBubbles(state);
  }

  private drawSharedWorldOverlays(state: IRenderFrameState): void {
    if (state.shrinkRadius !== undefined) {
      this.drawShrinkZone(state.arenaWidth * 0.5, state.arenaHeight * 0.5, state.shrinkRadius);
    }
    if (state.inkPuddles) {
      this.drawInkPuddles(state.inkPuddles);
    }
    if (state.laserSweepY !== undefined) {
      this.drawLaserSweep(state.arenaWidth, state.laserSweepY, state.safeCorridorIndex);
    }
    if (state.player.isAiming && !state.player.isRespawning) {
      this.drawAimTelegraph(state.player, state.obstacles);
    }
    if (state.droppedCrystals) {
      this.drawDroppedCrystals(state.droppedCrystals);
    }
    if (state.energyCrates) {
      this.drawEnergyCrates(state.energyCrates);
    }
    if (state.arenaBall) {
      this.drawArenaBall(state.arenaBall);
    }
    if (state.chatterDrones) {
      this.drawChatterDrones(state.chatterDrones);
    }
    if (state.rivalBot) {
      this.drawRivalBot(state.rivalBot);
    }
    if (state.compassTargetPos) {
      this.drawCompassArrow(state.player, state.compassTargetPos);
    }
  }

  private computeTargetLabelOffsets(targets: IRenderTarget[]): Map<string, number> {
    const offsets = new Map<string, number>();
    const placed: Array<{ x: number; y: number }> = [];
    for (const t of targets) {
      const headPos = this.worldToScreen(t.x, t.y, t.isBoss ? 92 : 60);
      let shiftY = 0;
      for (const prev of placed) {
        if (Math.abs(headPos.x - prev.x) < 110 * this.zoom && Math.abs(headPos.y + shiftY - prev.y) < 34 * this.zoom) {
          shiftY -= 36 * this.zoom;
        }
      }
      offsets.set(t.id, shiftY);
      placed.push({ x: headPos.x, y: headPos.y + shiftY });
    }
    return offsets;
  }

  private drawActiveBubbles(state: IRenderFrameState): void {
    const bubbles =
      state.floatingBubbles && state.floatingBubbles.length > 0
        ? state.floatingBubbles
        : state.flashBubble
          ? [state.flashBubble]
          : [];
    for (const bubble of bubbles) {
      this.drawFlashBubble(bubble);
    }
  }

  private drawObstacleLabelBadge(obs: IRenderObstacle): void {
    if (!obs.label) return;
    const p = this.worldToScreen(obs.x + obs.width * 0.5, obs.y + obs.height * 0.5, 22);
    const ctx = this.ctx;
    const fontSize = Math.max(12, Math.round(14 * this.zoom));
    ctx.save();
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    const pillW = Math.max(54 * this.zoom, ctx.measureText(obs.label).width + 22 * this.zoom);
    const pillH = 24 * this.zoom;
    const accent =
      obs.kind === 'goal_left'
        ? '#2563eb'
        : obs.kind === 'goal_right'
          ? '#eab308'
          : '#16a34a';
    const bottomColor =
      obs.kind === 'goal_left'
        ? '#1d4ed8'
        : obs.kind === 'goal_right'
          ? '#ca8a04'
          : '#15803d';

    this.drawSkewedPill(p.x, p.y, pillW, pillH, 6 * this.zoom, -0.16, accent, bottomColor, '#090d16', 2.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.drawOutlinedText(obs.label, p.x, p.y, '#ffffff', 3.5);
    ctx.restore();
  }

  private drawTargetOverlay(target: IRenderTarget, labelOffsetY = 0): void {
    const ctx = this.ctx;
    const headPos = this.worldToScreen(target.x, target.y, target.isBoss ? 92 : 60);
    const fontSize = Math.max(13, Math.round(15 * this.zoom));

    ctx.save();
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(target.label);
    const pillW = Math.max(62 * this.zoom, metrics.width + 24 * this.zoom);
    const pillH = 27 * this.zoom;
    const pillCenterY = headPos.y - pillH * 0.5 - 15 * this.zoom + labelOffsetY;

    let topColor = '#1e293b';
    let bottomColor = '#0f172a';
    let trimColor: string | null = null;
    if (target.hitFlashMs && target.hitFlashMs > 0) {
      topColor = '#f8fafc';
      bottomColor = '#fca5a5';
      trimColor = '#ffffff';
    } else if (target.highlighted) {
      topColor = '#fbbf24';
      bottomColor = '#b45309';
      trimColor = '#fef08a';
    } else if (target.isBoss) {
      topColor = '#7e22ce';
      bottomColor = '#3b0764';
      trimColor = '#f43f5e';
    } else if (target.frozen) {
      topColor = '#0284c7';
      bottomColor = '#0c4a6e';
      trimColor = '#7dd3fc';
    } else if (target.slowed) {
      topColor = '#6d28d9';
      bottomColor = '#2e1065';
      trimColor = '#c4b5fd';
    }

    this.drawSkewedPill(
      headPos.x,
      pillCenterY,
      pillW,
      pillH,
      7 * this.zoom,
      -0.18,
      topColor,
      bottomColor,
      trimColor,
      3 * this.zoom
    );

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.drawOutlinedText(target.label, headPos.x, pillCenterY + 0.5, '#ffffff', 3.5);

    // Barre de PV segmentée style Brawl Stars
    const hpRatio = Math.max(0, Math.min(1, target.hp / target.maxHp));
    const barW = (target.isBoss ? 88 : 56) * this.zoom;
    const barH = (target.isBoss ? 9 : 7) * this.zoom;
    const barX = headPos.x - barW * 0.5;
    const barY = headPos.y - 9 * this.zoom;
    const segments = target.isBoss ? 8 : 4;

    this.drawSegmentedBar(barX, barY, barW, barH, hpRatio, segments, '#f87171', '#dc2626', -0.14);

    if (target.isBoss) {
      ctx.font = `900 ${Math.max(10, Math.round(10 * this.zoom))}px system-ui, sans-serif`;
      this.drawOutlinedText(`${Math.ceil(target.hp)}`, headPos.x, barY + barH * 0.5, '#ffffff', 2.5);
    }
    ctx.restore();
  }

  private drawPlayerOverlay(player: IRenderPlayer): void {
    const ctx = this.ctx;
    const headPos = this.worldToScreen(player.x, player.y, 80);
    const barW = 74 * this.zoom;
    const barH = 9 * this.zoom;
    const barX = headPos.x - barW * 0.5;
    const barY = headPos.y - 14 * this.zoom;
    const superReady = player.superGaugePct >= 100;

    ctx.save();
    if (superReady) {
      const pulse = 0.45 + 0.35 * Math.sin(this.currentTimeSec * 7.5);
      ctx.strokeStyle = `rgba(250, 204, 21, ${pulse.toFixed(2)})`;
      ctx.lineWidth = 2.5 * this.zoom;
      this.roundRect(barX - 5, barY - 4, barW + 10, barH + 17 * this.zoom, 6);
      ctx.stroke();
    }

    // Barre de PV joueur segmentée (4 segments)
    const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
    this.drawSegmentedBar(barX, barY, barW, barH, hpRatio, 4, '#4ade80', '#16a34a', -0.14);

    if (player.shieldHp > 0) {
      const shieldRatio = Math.min(1, player.shieldHp / player.maxHp);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.78)';
      ctx.fillRect(barX, barY - 3 * this.zoom, barW * shieldRatio, 2.5 * this.zoom);
    }

    // Valeur PV centrée
    ctx.font = `900 ${Math.max(9, Math.round(10 * this.zoom))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.drawOutlinedText(`${Math.ceil(player.hp)}`, headPos.x, barY + barH * 0.5, '#ffffff', 2.5);

    // 3 barres de munitions segmentées orange/jaune Brawl Stars
    const gap = 3 * this.zoom;
    const ammoSlots = Math.max(1, player.maxAmmoBars);
    const ammoW = (barW - gap * (ammoSlots - 1)) / ammoSlots;
    const ammoH = 5.5 * this.zoom;
    const ammoY = barY + barH + 3.5 * this.zoom;

    for (let i = 0; i < ammoSlots; i++) {
      const fill = Math.max(0, Math.min(1, player.ammoBars - i));
      const slotX = barX + i * (ammoW + gap);
      const isFull = fill >= 1;
      this.drawSegmentedBar(
        slotX,
        ammoY,
        ammoW,
        ammoH,
        fill,
        1,
        isFull ? '#fde047' : '#fdba74',
        isFull ? '#f97316' : '#ea580c',
        -0.14
      );
    }

    // Nom du héros au-dessus de la barre
    ctx.font = `900 ${Math.max(11, Math.round(12 * this.zoom))}px system-ui, sans-serif`;
    const nameLabel = superReady ? `★ ${player.name}` : player.name;
    this.drawOutlinedText(
      nameLabel,
      headPos.x,
      barY - 9 * this.zoom,
      superReady ? '#fde047' : '#f8fafc',
      3
    );

    if (player.isStealthed) {
      ctx.font = `900 ${Math.max(10, Math.round(10 * this.zoom))}px system-ui, sans-serif`;
      this.drawOutlinedText('👻 FURTIF +20%', headPos.x, barY - 23 * this.zoom, '#67e8f9', 3);
    }
    if (player.isRespawning && (player.respawnRemainingMs ?? 0) > 0) {
      const sec = ((player.respawnRemainingMs ?? 0) / 1000).toFixed(1);
      ctx.font = `900 ${Math.max(11, Math.round(12 * this.zoom))}px system-ui, sans-serif`;
      this.drawOutlinedText(`⏳ RETOUR ${sec}s`, headPos.x, barY - 26 * this.zoom, '#fca5a5', 3.5);
    }
    ctx.restore();
  }

  private render2DFallback(state: IRenderFrameState, cssW: number, cssH: number): void {
    const ctx = this.ctx;
    const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    this.drawArenaFloor(state);
    this.drawObstacles(state.obstacles);
    this.drawSharedWorldOverlays(state);

    if (state.turretPos) {
      this.drawTurret(state.turretPos);
    }

    const labelOffsets = this.computeTargetLabelOffsets(state.targets);
    const sortedTargets = [...state.targets].sort((a, b) => a.y - b.y);
    for (const target of sortedTargets) {
      this.drawTarget2D(target, labelOffsets.get(target.id) ?? 0);
    }

    this.drawPlayer2D(state.player);

    for (const proj of state.projectiles) {
      this.drawProjectile2D(proj);
    }

    this.drawActiveBubbles(state);
  }

  private drawArenaFloor(state: IRenderFrameState): void {
    const ctx = this.ctx;
    const tl = this.worldToScreen(0, 0);
    const br = this.worldToScreen(state.arenaWidth, state.arenaHeight);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    ctx.save();
    ctx.fillStyle = state.modeId === 'MATCH_DES_ACCORDS' ? '#166534' : '#334155';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.fillRect(tl.x, tl.y, w, h);
    ctx.strokeRect(tl.x, tl.y, w, h);
    ctx.restore();
  }

  private drawObstacles(obstacles: IRenderObstacle[]): void {
    const ctx = this.ctx;
    for (const obs of obstacles) {
      const tl = this.worldToScreen(obs.x, obs.y);
      const br = this.worldToScreen(obs.x + obs.width, obs.y + obs.height);
      const w = br.x - tl.x;
      const h = br.y - tl.y;
      ctx.save();
      ctx.fillStyle = obs.kind === 'bush' ? '#15803d' : '#475569';
      ctx.fillRect(tl.x, tl.y, w, h);
      ctx.restore();
      if (obs.label) {
        this.drawObstacleLabelBadge(obs);
      }
    }
  }

  private drawShrinkZone(cx: number, cy: number, radius: number): void {
    const ctx = this.ctx;
    const center = this.worldToScreen(cx, cy);
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.ellipse(
      center.x,
      center.y,
      radius * this.zoom,
      radius * ISO_Y_SCALE * this.zoom,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  private drawLaserSweep(arenaWidth: number, laserY: number, safeCorridorIndex?: number): void {
    const ctx = this.ctx;
    const corridors = 4;
    const corW = arenaWidth / corridors;
    ctx.save();
    for (let i = 0; i < corridors; i++) {
      const x1 = i * corW;
      const x2 = (i + 1) * corW;
      const p1 = this.worldToScreen(x1 + 4, laserY, 10);
      const p2 = this.worldToScreen(x2 - 4, laserY, 10);
      if (safeCorridorIndex === i) {
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
        ctx.lineWidth = 4 * this.zoom;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `900 ${Math.max(11, Math.round(12 * this.zoom))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        this.drawOutlinedText('✓ COULOIR SÛR', (p1.x + p2.x) * 0.5, p1.y - 12 * this.zoom, '#86efac', 3);
      } else {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.92)';
        ctx.lineWidth = 11 * this.zoom;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawAimTelegraph(player: IRenderPlayer, obstacles: IRenderObstacle[]): void {
    const ctx = this.ctx;
    const range = player.attackRange ?? 380;
    const angle = player.aimAngle;
    const cancelling = Boolean(player.isCancellingAim);
    const color = cancelling ? 'rgba(239, 68, 68, 0.55)' : 'rgba(250, 204, 21, 0.45)';
    const border = cancelling ? 'rgba(248, 113, 113, 0.9)' : 'rgba(254, 240, 138, 0.85)';

    ctx.save();
    if (player.brawlerId === 'MAYA') {
      const origin = this.worldToScreen(player.x, player.y, 8);
      for (const offset of [-0.24, 0, 0.24]) {
        const end = this.worldToScreen(
          player.x + Math.cos(angle + offset) * Math.min(range, 270),
          player.y + Math.sin(angle + offset) * Math.min(range, 270),
          8
        );
        ctx.strokeStyle = border;
        ctx.lineWidth = 8 * this.zoom;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    } else if (player.brawlerId === 'LEO') {
      const targetWorldX = player.x + Math.cos(angle) * Math.min(range, 360);
      const targetWorldY = player.y + Math.sin(angle) * Math.min(range, 360);
      const origin = this.worldToScreen(player.x, player.y, 12);
      const landing = this.worldToScreen(targetWorldX, targetWorldY, 6);
      ctx.strokeStyle = border;
      ctx.lineWidth = 3 * this.zoom;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(landing.x, landing.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(landing.x, landing.y, 52 * this.zoom, 52 * ISO_Y_SCALE * this.zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Raycast léger contre les murs/bureaux pour le télégrafe linéaire
      let effectiveDist = range;
      const step = 18;
      for (let d = 24; d <= range; d += step) {
        const px = player.x + Math.cos(angle) * d;
        const py = player.y + Math.sin(angle) * d;
        const blocked = obstacles.some(
          (o) =>
            (o.kind === 'wall' || o.kind === 'desk') &&
            px >= o.x &&
            px <= o.x + o.width &&
            py >= o.y &&
            py <= o.y + o.height
        );
        if (blocked) {
          effectiveDist = d;
          break;
        }
      }
      const p1 = this.worldToScreen(player.x, player.y, 10);
      const p2 = this.worldToScreen(
        player.x + Math.cos(angle) * effectiveDist,
        player.y + Math.sin(angle) * effectiveDist,
        10
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = 14 * this.zoom;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.strokeStyle = border;
      ctx.lineWidth = 2.5 * this.zoom;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  private drawInkPuddles(
    puddles: Array<{ x: number; y: number; radius: number; remainingMs: number }>
  ): void {
    const ctx = this.ctx;
    ctx.save();
    for (const p of puddles) {
      const s = this.worldToScreen(p.x, p.y, 3);
      const alpha = Math.min(0.62, Math.max(0.15, p.remainingMs / 1800));
      ctx.fillStyle = `rgba(147, 51, 234, ${alpha.toFixed(2)})`;
      ctx.strokeStyle = `rgba(216, 180, 254, ${(alpha + 0.15).toFixed(2)})`;
      ctx.lineWidth = 2 * this.zoom;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, p.radius * this.zoom, p.radius * ISO_Y_SCALE * this.zoom, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDroppedCrystals(crystals: Array<{ id: string; x: number; y: number }>): void {
    const ctx = this.ctx;
    ctx.save();
    for (const c of crystals) {
      const bob = Math.sin(this.currentTimeSec * 5 + c.x) * 4;
      const p = this.worldToScreen(c.x, c.y, 12 + bob);
      const r = 11 * this.zoom;
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2 * this.zoom;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r * 0.75, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r * 0.75, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawEnergyCrates(
    crates: Array<{ id: string; x: number; y: number; hp: number; maxHp: number }>
  ): void {
    const ctx = this.ctx;
    ctx.save();
    for (const c of crates) {
      if (c.hp <= 0) continue;
      const p = this.worldToScreen(c.x, c.y, 14);
      const size = 34 * this.zoom;
      ctx.fillStyle = '#14532d';
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3 * this.zoom;
      this.roundRect(p.x - size * 0.5, p.y - size * 0.5, size, size, 6 * this.zoom);
      ctx.fill();
      ctx.stroke();

      ctx.font = `900 ${Math.max(11, Math.round(13 * this.zoom))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText('⚡', p.x, p.y, '#fde047', 2.5);

      const barW = 40 * this.zoom;
      const ratio = Math.max(0, Math.min(1, c.hp / Math.max(1, c.maxHp)));
      this.drawSegmentedBar(
        p.x - barW * 0.5,
        p.y - size * 0.5 - 10 * this.zoom,
        barW,
        5 * this.zoom,
        ratio,
        2,
        '#4ade80',
        '#16a34a',
        -0.12
      );
    }
    ctx.restore();
  }

  private drawArenaBall(ball: { x: number; y: number; radius: number }): void {
    const ctx = this.ctx;
    const p = this.worldToScreen(ball.x, ball.y, 12);
    const r = ball.radius * this.zoom;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3 * this.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = `900 ${Math.max(13, Math.round(r * 1.45))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚽', p.x, p.y + 1);
    ctx.restore();
  }

  private drawChatterDrones(drones: Array<{ id: string; x: number; y: number; radius: number }>): void {
    const ctx = this.ctx;
    ctx.save();
    for (const d of drones) {
      const p = this.worldToScreen(d.x, d.y, 14);
      const r = d.radius * this.zoom;
      ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5 * this.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = `900 ${Math.max(12, Math.round(13 * this.zoom))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText('💬!', p.x, p.y, '#fed7aa', 2.5);
    }
    ctx.restore();
  }

  private drawRivalBot(bot: {
    x: number;
    y: number;
    label: string;
    hp: number;
    maxHp: number;
  }): void {
    const ctx = this.ctx;
    const p = this.worldToScreen(bot.x, bot.y, 14);
    const r = 21 * this.zoom;
    ctx.save();
    ctx.fillStyle = '#be123c';
    ctx.strokeStyle = '#fda4af';
    ctx.lineWidth = 3.5 * this.zoom;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const head = this.worldToScreen(bot.x, bot.y, 68);
    ctx.font = `900 ${Math.max(10, Math.round(11 * this.zoom))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    this.drawOutlinedText(bot.label, head.x, head.y - 12 * this.zoom, '#fecdd3', 3);
    const barW = 54 * this.zoom;
    this.drawSegmentedBar(
      head.x - barW * 0.5,
      head.y - 4 * this.zoom,
      barW,
      6 * this.zoom,
      Math.max(0, Math.min(1, bot.hp / Math.max(1, bot.maxHp))),
      3,
      '#fb7185',
      '#e11d48',
      -0.12
    );
    ctx.restore();
  }

  private drawTurret(pos: IRenderVec2): void {
    const ctx = this.ctx;
    const p = this.worldToScreen(pos.x, pos.y, 12);
    ctx.save();
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18 * this.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawCompassArrow(player: IRenderPlayer, target: IRenderVec2): void {
    const ctx = this.ctx;
    const p1 = this.worldToScreen(player.x, player.y, 8);
    const p2 = this.worldToScreen(target.x, target.y, 8);
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(p1.x + Math.cos(angle) * 35, p1.y + Math.sin(angle) * 35);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawTarget2D(target: IRenderTarget, labelOffsetY = 0): void {
    const ctx = this.ctx;
    const screen = this.worldToScreen(target.x, target.y, 12);
    const r = target.radius * this.zoom;
    ctx.save();
    ctx.fillStyle = target.isCrystal ? '#38bdf8' : target.isBoss ? '#dc2626' : '#f97316';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.drawTargetOverlay(target, labelOffsetY);
  }

  private drawPlayer2D(player: IRenderPlayer): void {
    const ctx = this.ctx;
    const screen = this.worldToScreen(player.x, player.y, 14);
    const palette = BRAWLER_COLORS[player.brawlerId];
    const r = 24 * this.zoom;
    ctx.save();
    if (player.isStealthed || player.isRespawning) {
      ctx.globalAlpha = 0.45;
    }
    ctx.fillStyle = palette.primary;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    this.drawPlayerOverlay(player);
  }

  private drawProjectile2D(proj: IRenderProjectile): void {
    const ctx = this.ctx;
    const p = this.worldToScreen(proj.x, proj.y, proj.heightZ ?? 12);
    ctx.save();
    ctx.fillStyle = proj.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, proj.radius * this.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawFlashBubble(bubble: IRenderFlashBubble): void {
    const ctx = this.ctx;
    const cssW = this.canvas.clientWidth || 960;
    const p = this.worldToScreen(bubble.x, bubble.y, 74);
    ctx.save();
    const fontSize = 13;
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;

    const maxLineW = Math.min(340, cssW - 64);
    const words = bubble.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxLineW || !currentLine) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
        if (lines.length === 2) {
          break;
        }
      }
    }
    if (lines.length < 2 && currentLine) {
      lines.push(currentLine);
    }

    const widest = lines.reduce((m, line) => Math.max(m, ctx.measureText(line).width), 80);
    const w = Math.min(maxLineW + 34, widest + 34);
    const h = lines.length > 1 ? 52 : 36;
    const clampedX = Math.max(w * 0.5 + 12, Math.min(cssW - w * 0.5 - 12, p.x));
    const cy = Math.max(96, p.y - h * 0.5 - 22);

    this.drawSkewedPill(
      clampedX,
      cy,
      w,
      h,
      9,
      -0.14,
      bubble.isPositive ? '#22c55e' : '#ef4444',
      bubble.isPositive ? '#15803d' : '#991b1b',
      '#fde047',
      3.5
    );

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (lines.length === 1) {
      this.drawOutlinedText(lines[0], clampedX, cy + 0.5, '#ffffff', 3.5);
    } else {
      this.drawOutlinedText(lines[0], clampedX, cy - 8.5, '#ffffff', 3);
      this.drawOutlinedText(lines[1], clampedX, cy + 9.5, '#fef9c3', 3);
    }
    ctx.restore();
  }

  private drawJoysticks(
    left: IRenderJoystick,
    right: IRenderJoystick,
    isCancellingAim = false
  ): void {
    const entries: Array<{ stick: IRenderJoystick; isCancel: boolean }> = [
      { stick: left, isCancel: false },
      { stick: right, isCancel: isCancellingAim },
    ];
    for (const { stick, isCancel } of entries) {
      if (!stick.active) continue;
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = isCancel ? '#ef4444' : stick.color;
      ctx.fillStyle = isCancel ? 'rgba(127, 29, 29, 0.45)' : 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(stick.originX, stick.originY, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isCancel ? '#f87171' : stick.color;
      ctx.beginPath();
      ctx.arc(stick.currentX, stick.currentY, 20, 0, Math.PI * 2);
      ctx.fill();
      if (isCancel) {
        ctx.font = '900 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        this.drawOutlinedText('✕ ANNULER', stick.originX, stick.originY - 58, '#fecaca', 3);
      }
      ctx.restore();
    }
  }

  private drawHudOverlay(state: IRenderFrameState, cssW: number): void {
    const ctx = this.ctx;
    ctx.save();

    const leftW = Math.min(184, cssW * 0.22);
    const rightW = Math.min(202, cssW * 0.24);
    const bannerW = Math.min(540, Math.max(240, cssW - leftW - rightW - 56));
    const bannerH = 48;
    const bannerY = 16;
    const bannerCenterX = cssW * 0.5;
    const bannerCenterY = bannerY + bannerH * 0.5;

    // 1. Bannière centrale "Défi Flash" style Brawl Stars Esports
    this.drawSkewedPill(
      bannerCenterX,
      bannerCenterY,
      bannerW,
      bannerH,
      11,
      -0.12,
      '#1e293b',
      '#090d16',
      '#facc15',
      4.5
    );

    // Pastille supérieure "DÉFI FLASH"
    this.drawSkewedPill(
      bannerCenterX,
      bannerY - 1,
      106,
      18,
      5,
      -0.14,
      '#fde047',
      '#eab308',
      null,
      2.5
    );
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#090d16';
    ctx.fillText('DÉFI FLASH', bannerCenterX, bannerY - 0.5);

    // Texte principal de la question avec ajustement auto de taille
    let promptSize = 18;
    ctx.font = `900 ${promptSize}px system-ui, sans-serif`;
    const maxPromptW = bannerW - 34;
    const promptW = ctx.measureText(state.hudPrompt).width;
    if (promptW > maxPromptW && promptW > 0) {
      promptSize = Math.max(12, Math.floor((promptSize * maxPromptW) / promptW));
      ctx.font = `900 ${promptSize}px system-ui, sans-serif`;
    }
    this.drawOutlinedText(state.hudPrompt, bannerCenterX, bannerCenterY + 3, '#fef9c3', 4.5);

    // 2. Cartouche gauche : Chrono & Objectif
    const mins = Math.floor(state.remainingSeconds / 60);
    const secs = Math.floor(state.remainingSeconds % 60);
    const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;
    const isUrgent = state.remainingSeconds <= 15;
    const leftCenterX = 16 + leftW * 0.5;
    const sideCenterY = bannerCenterY;

    this.drawSkewedPill(
      leftCenterX,
      sideCenterY,
      leftW,
      46,
      10,
      -0.12,
      isUrgent ? '#7f1d1d' : '#1e293b',
      '#090d16',
      isUrgent ? '#fb7185' : '#38bdf8',
      3.5
    );

    ctx.font = '900 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    this.drawOutlinedText(
      `⏱ ${timeText}`,
      28,
      sideCenterY - 8,
      isUrgent ? '#fecdd3' : '#ffffff',
      3
    );
    ctx.font = '900 12px system-ui, sans-serif';
    this.drawOutlinedText(
      `${state.objectiveLabel}: ${state.objectiveScore}`,
      28,
      sideCenterY + 10,
      '#fde047',
      3
    );

    // 3. Cartouche droite : Combo, Super animé & Gadgets
    const rightCenterX = cssW - 16 - rightW * 0.5;
    const superPct = Math.max(0, Math.min(100, state.player.superGaugePct));
    const superReady = superPct >= 100;

    ctx.save();
    if (superReady) {
      const pulse = 0.5 + 0.5 * Math.sin(this.currentTimeSec * 8);
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 10 + pulse * 10;
    }
    this.drawSkewedPill(
      rightCenterX,
      sideCenterY,
      rightW,
      46,
      10,
      -0.12,
      superReady ? '#854d0e' : '#1e293b',
      '#090d16',
      superReady ? '#fde047' : '#38bdf8',
      3.5
    );
    ctx.restore();

    const gaugeX = cssW - 16 - rightW + 14;
    const gaugeW = rightW - 28;
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    this.drawOutlinedText(
      `x${state.player.comboMultiplier.toFixed(2)}`,
      gaugeX,
      sideCenterY - 9,
      '#38bdf8',
      3
    );

    ctx.textAlign = 'right';
    this.drawOutlinedText(
      superReady ? '★ SUPER PRÊT !' : `SUPER ${Math.round(superPct)}%`,
      cssW - 30,
      sideCenterY - 9,
      superReady ? '#fde047' : '#e2e8f0',
      3
    );

    // Jauge de progression Super
    this.drawSegmentedBar(
      gaugeX,
      sideCenterY + 3,
      gaugeW,
      9,
      superPct / 100,
      3,
      superReady ? '#fde047' : '#38bdf8',
      superReady ? '#f59e0b' : '#0284c7',
      -0.12
    );

    let stackCenterY = bannerY + bannerH + 14;
    if ((state.reflexRemainingRatio ?? 0) > 0) {
      const ratio = Math.max(0, Math.min(1, state.reflexRemainingRatio ?? 0));
      const barW = Math.min(240, bannerW * 0.65);
      this.drawSegmentedBar(
        bannerCenterX - barW * 0.5,
        stackCenterY - 4,
        barW,
        7,
        ratio,
        4,
        ratio > 0.35 ? '#38bdf8' : '#facc15',
        ratio > 0.35 ? '#0284c7' : '#d97706',
        -0.12
      );
      stackCenterY += 16;
    }

    if (state.rushBannerText) {
      const rushW = Math.min(280, Math.max(180, ctx.measureText(state.rushBannerText).width + 44));
      this.drawSkewedPill(
        bannerCenterX,
        stackCenterY + 6,
        rushW,
        24,
        6,
        -0.14,
        '#dc2626',
        '#7f1d1d',
        '#fde047',
        2.5
      );
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText(state.rushBannerText, bannerCenterX, stackCenterY + 6.5, '#fef08a', 3);
      stackCenterY += 28;
    }

    if (state.bossState) {
      const bossW = Math.min(360, bannerW * 0.88);
      const bossRatio = Math.max(0, Math.min(1, state.bossState.hp / Math.max(1, state.bossState.maxHp)));
      this.drawSkewedPill(
        bannerCenterX,
        stackCenterY + 11,
        bossW,
        28,
        7,
        -0.1,
        '#4c1d95',
        '#1e1b4b',
        '#f43f5e',
        2.5
      );
      ctx.font = '900 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      this.drawOutlinedText(
        `👑 ${state.bossState.name} • ${Math.ceil(state.bossState.hp)}/${state.bossState.maxHp}`,
        bannerCenterX,
        stackCenterY + 5,
        '#fecdd3',
        2.5
      );
      this.drawSegmentedBar(
        bannerCenterX - (bossW - 26) * 0.5,
        stackCenterY + 13,
        bossW - 26,
        7,
        bossRatio,
        6,
        '#f43f5e',
        '#9f1239',
        -0.1
      );
    }

    if (state.alivePlayersCount !== undefined) {
      this.drawSkewedPill(
        leftCenterX,
        sideCenterY + 34,
        leftW,
        22,
        6,
        -0.12,
        '#14532d',
        '#052e16',
        '#4ade80',
        2
      );
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      this.drawOutlinedText(`👥 Survivants : ${state.alivePlayersCount}/10`, leftCenterX, sideCenterY + 34.5, '#bbf7d0', 2.5);
    }

    if (state.capturePct !== undefined) {
      this.drawSkewedPill(
        leftCenterX,
        sideCenterY + 34,
        leftW,
        22,
        6,
        -0.12,
        '#1e3a8a',
        '#172554',
        '#60a5fa',
        2
      );
      this.drawSegmentedBar(
        leftCenterX - (leftW - 18) * 0.5,
        sideCenterY + 30,
        leftW - 18,
        8,
        Math.max(0, Math.min(1, state.capturePct / 100)),
        4,
        '#4ade80',
        '#16a34a',
        -0.12
      );
    }

    ctx.restore();
  }

  private drawSkewedPill(
    cx: number,
    cy: number,
    w: number,
    h: number,
    r: number,
    skew: number,
    topColor: string,
    bottomColor: string,
    trimColor: string | null,
    borderWidth = 3
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(1, 0, skew, 1, 0, 0);

    // Ombre portée dure style Brawl Stars
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    this.roundRect(-w * 0.5 + 2.5, -h * 0.5 + 3.5, w, h, r);
    ctx.fill();

    // Corps dégradé
    const grad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    this.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    ctx.fill();

    // Reflet brillant supérieur
    ctx.save();
    this.roundRect(-w * 0.5 + 1, -h * 0.5 + 1, w - 2, h - 2, Math.max(2, r - 1));
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h * 0.44);
    ctx.restore();

    // Contour épais #090d16
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = borderWidth;
    this.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    ctx.stroke();

    // Liséré intérieur optionnel
    if (trimColor) {
      ctx.strokeStyle = trimColor;
      ctx.lineWidth = Math.max(1.5, borderWidth * 0.48);
      this.roundRect(-w * 0.5 + 2, -h * 0.5 + 2, w - 4, h - 4, Math.max(2, r - 2));
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawSegmentedBar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    segments: number,
    topColor: string,
    bottomColor: string,
    skew = -0.14
  ): void {
    const ctx = this.ctx;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const r = Math.min(3.5, h * 0.42);
    const clampedRatio = Math.max(0, Math.min(1, ratio));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.transform(1, 0, skew, 1, 0, 0);

    // Ombre portée
    ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
    this.roundRect(-w * 0.5 + 1.5, -h * 0.5 + 2, w, h, r);
    ctx.fill();

    // Fond sombre
    ctx.fillStyle = '#0f172a';
    this.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    ctx.fill();

    // Remplissage dégradé + reflet
    if (clampedRatio > 0) {
      ctx.save();
      this.roundRect(-w * 0.5, -h * 0.5, w, h, r);
      ctx.clip();
      const grad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
      grad.addColorStop(0, topColor);
      grad.addColorStop(1, bottomColor);
      ctx.fillStyle = grad;
      ctx.fillRect(-w * 0.5, -h * 0.5, w * clampedRatio, h);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(-w * 0.5, -h * 0.5, w * clampedRatio, h * 0.38);
      ctx.restore();
    }

    // Séparateurs de segments
    if (segments > 1) {
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.4;
      for (let i = 1; i < segments; i++) {
        const sx = -w * 0.5 + (w * i) / segments;
        ctx.beginPath();
        ctx.moveTo(sx, -h * 0.5);
        ctx.lineTo(sx, h * 0.5);
        ctx.stroke();
      }
    }

    // Contour épais #090d16
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 2.2;
    this.roundRect(-w * 0.5, -h * 0.5, w, h, r);
    ctx.stroke();

    ctx.restore();
  }

  private drawOutlinedText(
    text: string,
    x: number,
    y: number,
    fillStyle: string,
    strokeWidth = 3.5,
    strokeStyle = '#090d16'
  ): void {
    const ctx = this.ctx;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fillStyle;
    ctx.fillText(text, x, y);
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
