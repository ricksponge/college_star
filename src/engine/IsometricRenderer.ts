import * as THREE from 'three';
import type { BrawlerId, GameModeId, ICampusRoomZone } from '../types/cctp';
import {
  animateBrawler3DRig,
  createBrawler3DModel,
  createCampusBadge3DModel,
  createCampusNpc3DModel,
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

export interface IRenderCampusNpc {
  id: string;
  name: string;
  title: string;
  x: number;
  y: number;
  primaryColor: string;
  accentColor: string;
  hasQuestMarker: boolean;
  isPlayerNear: boolean;
}

export interface IRenderCampusBadge {
  id: string;
  x: number;
  y: number;
  label: string;
}

export interface IRenderQuestBanner {
  questTitle: string;
  objectiveText: string;
  progressText: string;
  currentRoomName: string;
}

export interface IRenderMinimapState {
  worldWidth: number;
  worldHeight: number;
  rooms: ICampusRoomZone[];
  playerX: number;
  playerY: number;
  objectivePos?: IRenderVec2 | null;
  npcs: Array<{ x: number; y: number; hasQuest: boolean }>;
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
  hintText?: string | null;
  isTouchHintVisible?: boolean;
  shakeIntensity?: number;
  leftStick: IRenderJoystick;
  rightStick: IRenderJoystick;
  campusRooms?: ICampusRoomZone[];
  campusNpcs?: IRenderCampusNpc[];
  campusBadges?: IRenderCampusBadge[];
  questBanner?: IRenderQuestBanner;
  minimapState?: IRenderMinimapState;
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
  private cameraInitialized = false;
  private zoom = 1;

  // Sous-système 3D Three.js
  private webglReady = false;
  private webglCanvas: HTMLCanvasElement | null = null;
  private webglRenderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera3D: THREE.OrthographicCamera | null = null;
  private arenaGroup: THREE.Group | null = null;
  private arenaEnvGroup: THREE.Group | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private builtArenaKey = '';

  private playerRig: IBrawler3DRig | null = null;
  private prevPlayerX = 0;
  private prevPlayerY = 0;
  private moveHoldMs = 0;
  private lastRenderMs = performance.now();
  private currentTimeSec = 0;

  private readonly targetMeshes = new Map<string, ICachedTarget3D>();
  private readonly npcMeshes = new Map<string, { group: THREE.Group; hasQuestMarker: boolean }>();
  private readonly badgeMeshes = new Map<string, THREE.Group>();
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
      scene.add(sunLight.target);

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
      this.sunLight = sunLight;
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
    for (const cached of this.npcMeshes.values()) {
      this.scene?.remove(cached.group);
      disposeObject3D(cached.group);
    }
    this.npcMeshes.clear();
    for (const badgeGroup of this.badgeMeshes.values()) {
      this.scene?.remove(badgeGroup);
      disposeObject3D(badgeGroup);
    }
    this.badgeMeshes.clear();
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
    this.sunLight = null;
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

    // Caméra verrouillée sur le joueur avec léger lissage (instantanée à la première frame)
    if (!this.cameraInitialized) {
      this.cameraX = state.player.x;
      this.cameraY = state.player.y;
      this.cameraInitialized = true;
    } else {
      this.cameraX += (state.player.x - this.cameraX) * 0.18;
      this.cameraY += (state.player.y - this.cameraY) * 0.18;
    }

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

    this.drawJoysticks(
      state.leftStick,
      state.rightStick,
      state.player.isCancellingAim,
      cssW,
      cssH,
      state.isTouchHintVisible ?? true
    );
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

    if (this.sunLight) {
      this.sunLight.position.set(lookX + 12, 28, lookZ + 14);
      this.sunLight.target.position.set(lookX, 0, lookZ);
      this.sunLight.target.updateMatrixWorld();
    }

    // Sol & obstacles 3D (reconstruits uniquement au changement de mode, d'obstacles ou de campus)
    const obsSig = state.obstacles
      .map((o) => `${o.kind[0]}${Math.round(o.x)},${Math.round(o.y)}`)
      .join(';');
    const campusFlag = state.campusRooms ? `CAMPUS_${state.campusRooms.length}` : '';
    const arenaKey = `${state.modeId}_${state.arenaWidth}x${state.arenaHeight}_${campusFlag}_${obsSig}`;
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

    // PNJ 3D du campus
    const activeNpcIds = new Set<string>();
    for (const npc of state.campusNpcs ?? []) {
      activeNpcIds.add(npc.id);
      let cached = this.npcMeshes.get(npc.id);
      if (!cached || cached.hasQuestMarker !== npc.hasQuestMarker) {
        if (cached) {
          this.scene.remove(cached.group);
          disposeObject3D(cached.group);
        }
        const group = createCampusNpc3DModel(
          npc.primaryColor,
          npc.accentColor,
          npc.hasQuestMarker
        );
        this.scene.add(group);
        cached = { group, hasQuestMarker: npc.hasQuestMarker };
        this.npcMeshes.set(npc.id, cached);
      }

      cached.group.position.set(npc.x * WORLD_SCALE_3D, 0, npc.y * WORLD_SCALE_3D);

      const dx = state.player.x - npc.x;
      const dz = state.player.y - npc.y;
      const dist = Math.hypot(dx, dz);
      const bodyGroup = cached.group.userData.bodyGroup as THREE.Object3D | undefined;
      const turnTarget = bodyGroup ?? cached.group;
      if (dist < 280 && dist > 1) {
        turnTarget.rotation.y = Math.atan2(dx, dz);
      } else {
        turnTarget.rotation.y = Math.sin(timeSec * 0.9 + npc.x * 0.01) * 0.16;
      }
      if (bodyGroup) {
        bodyGroup.position.y = Math.sin(timeSec * 2.6 + npc.y * 0.02) * 0.035;
      }

      const marker =
        cached.group.getObjectByName('questMarker') ??
        (cached.group.userData.questMarker as THREE.Object3D | undefined);
      if (marker) {
        const baseY = (cached.group.userData.questMarkerBaseY as number | undefined) ?? 2.28;
        marker.position.y = baseY + Math.sin(timeSec * 4.2) * 0.14;
        marker.rotation.y = timeSec * 1.8;
      }
    }

    for (const [id, cached] of this.npcMeshes.entries()) {
      if (!activeNpcIds.has(id)) {
        this.scene.remove(cached.group);
        disposeObject3D(cached.group);
        this.npcMeshes.delete(id);
      }
    }

    // Badges collectables 3D du campus
    const activeBadgeIds = new Set<string>();
    for (const badge of state.campusBadges ?? []) {
      activeBadgeIds.add(badge.id);
      let badgeGroup = this.badgeMeshes.get(badge.id);
      if (!badgeGroup) {
        badgeGroup = createCampusBadge3DModel();
        this.scene.add(badgeGroup);
        this.badgeMeshes.set(badge.id, badgeGroup);
      }
      badgeGroup.position.set(
        badge.x * WORLD_SCALE_3D,
        Math.sin(timeSec * 3.1 + badge.x * 0.02) * 0.1,
        badge.y * WORLD_SCALE_3D
      );
      badgeGroup.rotation.y = timeSec * 1.6;
    }

    for (const [id, badgeGroup] of this.badgeMeshes.entries()) {
      if (!activeBadgeIds.has(id)) {
        this.scene.remove(badgeGroup);
        disposeObject3D(badgeGroup);
        this.badgeMeshes.delete(id);
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

    if (!state.campusRooms || state.campusRooms.length === 0) {
      const envGroup = buildArenaEnvironment3D(
        state.modeId,
        w3d,
        h3d,
        state.obstacles,
        WORLD_SCALE_3D
      );
      this.arenaGroup.add(envGroup);
      this.arenaEnvGroup = envGroup;
      return;
    }

    this.arenaEnvGroup = null;

    // Cour / Couloirs du collège 3D
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w3d, h3d),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w3d * 0.5, 0, h3d * 0.5);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Quadrillage & bordures dorées
    const grid = new THREE.GridHelper(Math.max(w3d, h3d), 32, 0x64748b, 0x475569);
    grid.position.set(w3d * 0.5, 0.008, h3d * 0.5);
    grid.scale.set(w3d / Math.max(w3d, h3d), 1, h3d / Math.max(w3d, h3d));
    this.arenaGroup.add(grid);

    // Salles du campus surélevées (y = 0.02) avec bordure lumineuse
    for (const room of state.campusRooms) {
      const rw = room.bounds.width * WORLD_SCALE_3D;
      const rd = room.bounds.height * WORLD_SCALE_3D;
      const rx = (room.bounds.x + room.bounds.width * 0.5) * WORLD_SCALE_3D;
      const rz = (room.bounds.y + room.bounds.height * 0.5) * WORLD_SCALE_3D;

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(rw, 0.04, rd),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(room.floor_color),
          roughness: 0.8,
          metalness: 0.05,
        })
      );
      slab.position.set(rx, 0.02, rz);
      slab.receiveShadow = true;
      this.arenaGroup.add(slab);

      const accentColor = new THREE.Color(room.accent_color);
      const borderMatRoom = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: 0.4,
        roughness: 0.35,
      });
      const trimT = 0.14;
      const trimH = 0.05;
      const roomEdges: Array<[number, number, number, number]> = [
        [rx, room.bounds.y * WORLD_SCALE_3D + trimT * 0.5, rw, trimT],
        [rx, (room.bounds.y + room.bounds.height) * WORLD_SCALE_3D - trimT * 0.5, rw, trimT],
        [room.bounds.x * WORLD_SCALE_3D + trimT * 0.5, rz, trimT, rd],
        [(room.bounds.x + room.bounds.width) * WORLD_SCALE_3D - trimT * 0.5, rz, trimT, rd],
      ];
      for (const [ex, ez, ew, ed] of roomEdges) {
        const edgeMesh = new THREE.Mesh(new THREE.BoxGeometry(ew, trimH, ed), borderMatRoom);
        edgeMesh.position.set(ex, 0.045, ez);
        this.arenaGroup.add(edgeMesh);
      }
    }

    const borderMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 });
    const wallThickness = 0.4;
    const borders: Array<[number, number, number, number]> = [
      [w3d * 0.5, 0, w3d + wallThickness, wallThickness],
      [w3d * 0.5, h3d, w3d + wallThickness, wallThickness],
      [0, h3d * 0.5, wallThickness, h3d],
      [w3d, h3d * 0.5, wallThickness, h3d],
    ];
    for (const [bx, bz, bw, bd] of borders) {
      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.65, bd), borderMat);
      bMesh.position.set(bx, 0.32, bz);
      bMesh.castShadow = true;
      this.arenaGroup.add(bMesh);
    }

    // Obstacles 3D volumétriques du campus
    for (const obs of state.obstacles) {
      const ow = obs.width * WORLD_SCALE_3D;
      const od = obs.height * WORLD_SCALE_3D;
      const ox = obs.x * WORLD_SCALE_3D + ow * 0.5;
      const oz = obs.y * WORLD_SCALE_3D + od * 0.5;

      if (obs.kind === 'goal_left' || obs.kind === 'goal_right' || obs.kind === 'safe_zone') {
        const zoneColor =
          obs.kind === 'goal_left'
            ? 0x3b82f6
            : obs.kind === 'goal_right'
              ? 0xeab308
              : 0x22c55e;
        const zoneMesh = new THREE.Mesh(
          new THREE.BoxGeometry(ow, 0.12, od),
          new THREE.MeshStandardMaterial({
            color: zoneColor,
            transparent: true,
            opacity: 0.55,
          })
        );
        zoneMesh.position.set(ox, 0.06, oz);
        this.arenaGroup.add(zoneMesh);
      } else {
        const h = obs.kind === 'wall' ? 1.1 : 0.85;
        const color = obs.kind === 'bush' ? 0x16a34a : obs.kind === 'desk' ? 0x92400e : 0x64748b;
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(ow, h, od),
          new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
        );
        block.position.set(ox, h * 0.5, oz);
        block.castShadow = true;
        block.receiveShadow = true;
        this.arenaGroup.add(block);
      }
    }
  }

  private draw2DOverlaysOn3D(state: IRenderFrameState): void {
    this.drawSharedWorldOverlays(state);
    for (const obs of state.obstacles) {
      if (!obs.label) continue;
      this.drawObstacleLabelBadge(obs);
    }
    if (state.campusBadges?.length) {
      this.drawCampusBadgesOverlay(state.campusBadges);
    }
    if (state.campusNpcs?.length) {
      this.drawCampusNpcsOverlay(state.campusNpcs);
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
      this.drawAimTelegraph(state.player, state.obstacles, state.targets);
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
    if (state.campusRooms?.length) {
      this.drawCampusRoomLabels(state.campusRooms);
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
        if (Math.abs(headPos.x - prev.x) < 118 * this.zoom && Math.abs(headPos.y + shiftY - prev.y) < 38 * this.zoom) {
          shiftY -= 38 * this.zoom;
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
    const displayLabel = target.highlighted ? `⭐ ${target.label}` : target.label;
    const fontSize = Math.max(14, Math.round(16 * this.zoom));

    ctx.save();
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(displayLabel);
    const pillW = Math.max(68 * this.zoom, metrics.width + 28 * this.zoom);
    const pillH = 30 * this.zoom;
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

    if (target.highlighted) {
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 14;
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
      (target.highlighted ? 3.8 : 3) * this.zoom
    );
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.drawOutlinedText(displayLabel, headPos.x, pillCenterY + 0.5, '#ffffff', 3.5);

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
    if (state.campusRooms?.length) {
      this.drawCampusRooms2D(state.campusRooms);
    }
    this.drawObstacles(state.obstacles);
    this.drawSharedWorldOverlays(state);

    if (state.turretPos) {
      this.drawTurret(state.turretPos);
    }
    if (state.campusBadges?.length) {
      this.drawCampusBadges2D(state.campusBadges);
    }
    if (state.campusNpcs?.length) {
      this.drawCampusNpcs2D(state.campusNpcs);
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
    ctx.fillStyle = state.campusRooms
      ? '#1e293b'
      : state.modeId === 'MATCH_DES_ACCORDS'
        ? '#166534'
        : '#334155';
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
      ctx.fillStyle =
        obs.kind === 'bush'
          ? '#15803d'
          : obs.kind === 'safe_zone'
            ? 'rgba(34, 197, 94, 0.45)'
            : obs.kind === 'desk'
              ? '#92400e'
              : '#475569';
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

  private drawAimTelegraph(
    player: IRenderPlayer,
    obstacles: IRenderObstacle[],
    targets: IRenderTarget[] = []
  ): void {
    const ctx = this.ctx;
    const range = player.attackRange ?? 380;
    const angle = player.aimAngle;
    const cancelling = Boolean(player.isCancellingAim);
    const color = cancelling ? 'rgba(239, 68, 68, 0.55)' : 'rgba(250, 204, 21, 0.45)';
    const border = cancelling ? 'rgba(248, 113, 113, 0.9)' : 'rgba(254, 240, 138, 0.85)';

    let effectiveRayRange = range;
    if (player.brawlerId !== 'MAYA' && player.brawlerId !== 'LEO') {
      // Raycast léger contre les murs/bureaux pour le télégrafe linéaire
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
          effectiveRayRange = d;
          break;
        }
      }
    }

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
      const p1 = this.worldToScreen(player.x, player.y, 10);
      const p2 = this.worldToScreen(
        player.x + Math.cos(angle) * effectiveRayRange,
        player.y + Math.sin(angle) * effectiveRayRange,
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

    // Réticule de verrouillage (Target-Lock) sur la cible alignée avec le rayon de visée
    if (!cancelling && targets.length > 0) {
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      let lockedTarget: IRenderTarget | null = null;
      let bestAlong = Infinity;

      for (const target of targets) {
        if (target.hp <= 0) continue;
        const dx = target.x - player.x;
        const dy = target.y - player.y;
        const along = dx * ux + dy * uy;
        if (along < 0 || along > effectiveRayRange + target.radius) continue;
        const perpDist = Math.abs(dx * uy - dy * ux);
        if (perpDist <= target.radius + 26 && along < bestAlong) {
          bestAlong = along;
          lockedTarget = target;
        }
      }

      if (lockedTarget) {
        const lockCenter = this.worldToScreen(lockedTarget.x, lockedTarget.y, 10);
        const pulse = 0.5 + 0.5 * Math.sin(this.currentTimeSec * 10);
        const rx = (lockedTarget.radius + 12 + pulse * 5) * this.zoom;
        const ry = rx * ISO_Y_SCALE;

        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.36)';
        ctx.lineWidth = 6 * this.zoom;
        ctx.beginPath();
        ctx.ellipse(lockCenter.x, lockCenter.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.8 * this.zoom;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.ellipse(lockCenter.x, lockCenter.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = `900 ${Math.max(13, Math.round(14 * this.zoom))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.drawOutlinedText('🎯', lockCenter.x, lockCenter.y - ry - 9 * this.zoom, '#fde047', 2.5);
      }
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
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (dist < 18) return;

    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const lineEndDist = Math.min(dist, 220 * this.zoom);
    const startDist = 34 * this.zoom;

    ctx.save();
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(p1.x + Math.cos(angle) * startDist, p1.y + Math.sin(angle) * startDist);
    ctx.lineTo(p1.x + Math.cos(angle) * lineEndDist, p1.y + Math.sin(angle) * lineEndDist);
    ctx.stroke();

    // Pointe directionnelle dorée toujours lisible autour du joueur
    const tipDist = Math.min(dist, 64 * this.zoom);
    const tipX = p1.x + Math.cos(angle) * tipDist;
    const tipY = p1.y + Math.sin(angle) * tipDist;
    ctx.setLineDash([]);
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -7);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 7);
    ctx.closePath();
    ctx.fill();
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
      bubble.isPositive ? '#22c55e' : '#1d4ed8',
      bubble.isPositive ? '#15803d' : '#1e3a8a',
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
    isCancellingAim = false,
    cssW = this.canvas.clientWidth || 960,
    cssH = this.canvas.clientHeight || 540,
    showTouchHints = true
  ): void {
    const ctx = this.ctx;

    if (showTouchHints && !left.active) {
      const gx = 92;
      const gy = cssH - 96;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(gx, gy, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(gx, gy, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText('🕹️ BOUGER', gx, gy - 50, '#e0f2fe', 3);
      ctx.restore();
    }

    if (showTouchHints && !right.active) {
      const gx = Math.max(200, cssW - 220);
      const gy = cssH - 86;
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#ef4444';
      ctx.fillStyle = 'rgba(127, 29, 29, 0.42)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(gx, gy, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(gx, gy, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '900 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText('🎯 TIRER / AUTO', gx, gy - 45, '#fef08a', 3);
      ctx.restore();
    }

    const entries: Array<{ stick: IRenderJoystick; isCancel: boolean }> = [
      { stick: left, isCancel: false },
      { stick: right, isCancel: isCancellingAim },
    ];
    for (const { stick, isCancel } of entries) {
      if (!stick.active) continue;
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

  private drawCampusRooms2D(rooms: ICampusRoomZone[]): void {
    const ctx = this.ctx;
    for (const room of rooms) {
      const tl = this.worldToScreen(room.bounds.x, room.bounds.y);
      const br = this.worldToScreen(
        room.bounds.x + room.bounds.width,
        room.bounds.y + room.bounds.height
      );
      const w = br.x - tl.x;
      const h = br.y - tl.y;

      ctx.save();
      ctx.fillStyle = room.floor_color;
      ctx.strokeStyle = room.accent_color;
      ctx.lineWidth = 3;
      ctx.fillRect(tl.x, tl.y, w, h);
      ctx.strokeRect(tl.x, tl.y, w, h);
      ctx.restore();
    }
  }

  private drawCampusRoomLabels(rooms: ICampusRoomZone[]): void {
    const ctx = this.ctx;
    const cssW = this.canvas.clientWidth || 960;
    const cssH = this.canvas.clientHeight || 540;
    const fontSize = Math.max(11, Math.round(12 * this.zoom));

    for (const room of rooms) {
      const anchor = this.worldToScreen(
        room.bounds.x + room.bounds.width * 0.5,
        room.bounds.y + 24,
        2
      );
      if (anchor.x < -180 || anchor.x > cssW + 180 || anchor.y < -60 || anchor.y > cssH + 60) {
        continue;
      }

      const label = `${room.name} • ${room.floor_label}`;
      ctx.save();
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      const textW = ctx.measureText(label).width;
      const pillW = textW + 18 * this.zoom;
      const pillH = 22 * this.zoom;
      const pillX = anchor.x - pillW * 0.5;
      const pillY = anchor.y - pillH * 0.5;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.strokeStyle = room.accent_color;
      ctx.lineWidth = 1.5;
      this.roundRect(pillX, pillY, pillW, pillH, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, anchor.x, anchor.y);
      ctx.restore();
    }
  }

  private drawCampusBadges2D(badges: IRenderCampusBadge[]): void {
    const ctx = this.ctx;
    for (const badge of badges) {
      const screen = this.worldToScreen(badge.x, badge.y, 12);
      const r = 16 * this.zoom;
      ctx.save();
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      this.drawCampusBadgeLabel(badge);
    }
  }

  private drawCampusBadgesOverlay(badges: IRenderCampusBadge[]): void {
    for (const badge of badges) {
      this.drawCampusBadgeLabel(badge);
    }
  }

  private drawCampusBadgeLabel(badge: IRenderCampusBadge): void {
    const ctx = this.ctx;
    const headPos = this.worldToScreen(badge.x, badge.y, 44);
    const fontSize = Math.max(11, Math.round(12 * this.zoom));
    const text = `★ ${badge.label}`;

    ctx.save();
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    const pillW = Math.max(60 * this.zoom, ctx.measureText(text).width + 18 * this.zoom);
    const pillH = 22 * this.zoom;
    const pillX = headPos.x - pillW * 0.5;
    const pillY = headPos.y - pillH;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    this.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, headPos.x, pillY + pillH * 0.5);
    ctx.restore();
  }

  private drawCampusNpcs2D(npcs: IRenderCampusNpc[]): void {
    const ctx = this.ctx;
    for (const npc of npcs) {
      const screen = this.worldToScreen(npc.x, npc.y, 14);
      const r = 21 * this.zoom;
      ctx.save();
      ctx.fillStyle = npc.primaryColor;
      ctx.strokeStyle = npc.accentColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (npc.hasQuestMarker) {
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y - r - 12 * this.zoom, 10 * this.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.font = `900 ${Math.max(12, Math.round(13 * this.zoom))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', screen.x, screen.y - r - 12 * this.zoom);
      }
      ctx.restore();

      this.drawCampusNpcLabel(npc);
    }
  }

  private drawCampusNpcsOverlay(npcs: IRenderCampusNpc[]): void {
    for (const npc of npcs) {
      this.drawCampusNpcLabel(npc);
    }
  }

  private drawCampusNpcLabel(npc: IRenderCampusNpc): void {
    const ctx = this.ctx;
    const headPos = this.worldToScreen(npc.x, npc.y, 76);
    const nameSize = Math.max(12, Math.round(13 * this.zoom));
    const titleSize = Math.max(10, Math.round(11 * this.zoom));

    ctx.save();
    ctx.font = `800 ${nameSize}px system-ui, sans-serif`;
    const nameW = ctx.measureText(npc.name).width;
    ctx.font = `600 ${titleSize}px system-ui, sans-serif`;
    const titleW = ctx.measureText(npc.title).width;

    const pillW = Math.max(82 * this.zoom, Math.max(nameW, titleW) + 20 * this.zoom);
    const pillH = 34 * this.zoom;
    const pillX = headPos.x - pillW * 0.5;
    const pillY = headPos.y - pillH - 6 * this.zoom;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = npc.hasQuestMarker ? '#facc15' : npc.accentColor;
    ctx.lineWidth = npc.hasQuestMarker ? 2.5 : 1.8;
    this.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${nameSize}px system-ui, sans-serif`;
    ctx.fillText(npc.name, headPos.x, pillY + pillH * 0.34);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 ${titleSize}px system-ui, sans-serif`;
    ctx.fillText(npc.title, headPos.x, pillY + pillH * 0.72);

    if (npc.isPlayerNear) {
      const promptText = '[Parler / Défi]';
      const promptSize = Math.max(11, Math.round(12 * this.zoom));
      ctx.font = `900 ${promptSize}px system-ui, sans-serif`;
      const promptW = Math.max(112 * this.zoom, ctx.measureText(promptText).width + 20 * this.zoom);
      const promptH = 24 * this.zoom;
      const promptX = headPos.x - promptW * 0.5;
      const promptY = pillY - promptH - 6 * this.zoom;

      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      this.roundRect(promptX, promptY, promptW, promptH, 9);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.fillText(promptText, headPos.x, promptY + promptH * 0.5);
    }

    ctx.restore();
  }

  private drawMinimap(minimap: IRenderMinimapState, cssW: number): void {
    const ctx = this.ctx;
    const mapW = 176;
    const mapH = 132;
    const mapX = cssW - 190;
    const mapY = 68;
    const pad = 6;
    const innerW = mapW - pad * 2;
    const innerH = mapH - pad * 2;
    const scaleX = innerW / Math.max(1, minimap.worldWidth);
    const scaleY = innerH / Math.max(1, minimap.worldHeight);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    this.roundRect(mapX, mapY, mapW, mapH, 10);
    ctx.fill();
    ctx.stroke();

    // Salles colorées
    for (const room of minimap.rooms) {
      const rx = mapX + pad + room.bounds.x * scaleX;
      const ry = mapY + pad + room.bounds.y * scaleY;
      const rw = room.bounds.width * scaleX;
      const rh = room.bounds.height * scaleY;
      ctx.fillStyle = room.floor_color;
      ctx.strokeStyle = room.accent_color;
      ctx.lineWidth = 1;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // Points PNJ (doré si quête active)
    for (const npc of minimap.npcs) {
      const nx = mapX + pad + npc.x * scaleX;
      const ny = mapY + pad + npc.y * scaleY;
      ctx.fillStyle = npc.hasQuest ? '#facc15' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(nx, ny, npc.hasQuest ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Marqueur pulsant d'objectif actif
    if (minimap.objectivePos) {
      const ox = mapX + pad + minimap.objectivePos.x * scaleX;
      const oy = mapY + pad + minimap.objectivePos.y * scaleY;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.008);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(ox, oy, 4.5 + pulse * 3.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(ox, oy, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Point joueur vert / blanc
    const px = mapX + pad + minimap.playerX * scaleX;
    const py = mapY + pad + minimap.playerY * scaleY;
    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawHudOverlay(state: IRenderFrameState, cssW: number): void {
    const ctx = this.ctx;
    ctx.save();

    const leftW = Math.min(184, cssW * 0.22);
    const rightW = Math.min(202, cssW * 0.24);
    const trimmedPrompt = state.hudPrompt.trim();
    const isGenericOrEmpty =
      trimmedPrompt.length === 0 ||
      trimmedPrompt === state.questBanner?.objectiveText ||
      /^explore/i.test(trimmedPrompt);

    const bannerW = Math.min(540, Math.max(240, cssW - leftW - rightW - 56));
    const bannerH = state.questBanner && isGenericOrEmpty ? 54 : 48;
    const bannerY = 16;
    const bannerCenterX = cssW * 0.5;
    const bannerCenterY = bannerY + bannerH * 0.5;

    // 1. Bannière centrale "Défi Flash" (ou Bannière Quête Campus M4)
    const bannerTopText = state.questBanner
      ? isGenericOrEmpty
        ? `${state.questBanner.questTitle.slice(0, 26)} • ${state.questBanner.currentRoomName}`
        : `DÉFI FLASH • ${state.questBanner.currentRoomName}`
      : 'DÉFI FLASH';
    this.drawSkewedPill(
      bannerCenterX,
      bannerCenterY,
      bannerW,
      bannerH,
      11,
      -0.12,
      '#1e293b',
      '#090d16',
      state.questBanner && isGenericOrEmpty ? '#38bdf8' : '#facc15',
      4.5
    );

    this.drawSkewedPill(
      bannerCenterX,
      bannerY - 1,
      Math.max(106, Math.min(340, bannerTopText.length * 7 + 30)),
      18,
      5,
      -0.14,
      state.questBanner && isGenericOrEmpty ? '#38bdf8' : '#fde047',
      state.questBanner && isGenericOrEmpty ? '#0284c7' : '#eab308',
      null,
      2.5
    );
    ctx.font = '900 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#090d16';
    ctx.fillText(bannerTopText.toUpperCase(), bannerCenterX, bannerY - 0.5);

    const promptText = !isGenericOrEmpty
      ? state.hudPrompt
      : state.questBanner
        ? `${state.questBanner.objectiveText} (${state.questBanner.progressText})`
        : state.hudPrompt;

    // Texte principal de la question ou de l'objectif avec ajustement auto de taille
    let promptSize = state.questBanner && isGenericOrEmpty ? 15 : 18;
    ctx.font = `900 ${promptSize}px system-ui, sans-serif`;
    const maxPromptW = bannerW - 34;
    const promptW = ctx.measureText(promptText).width;
    if (promptW > maxPromptW && promptW > 0) {
      promptSize = Math.max(11, Math.floor((promptSize * maxPromptW) / promptW));
      ctx.font = `900 ${promptSize}px system-ui, sans-serif`;
    }
    this.drawOutlinedText(promptText, bannerCenterX, bannerCenterY + 3, '#fef9c3', 4.5);

    // 2. Cartouche gauche : Chrono & Objectif
    const mins = Math.floor(state.remainingSeconds / 60);
    const secs = Math.floor(state.remainingSeconds % 60);
    const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;
    const isUrgent = !state.campusRooms && state.remainingSeconds <= 15;
    const leftCenterX = 16 + leftW * 0.5;
    const sideCenterY = bannerY + 24;

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

    if (state.minimapState) {
      this.drawMinimap(state.minimapState, cssW);
    }

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
    if (state.questBanner && !isGenericOrEmpty) {
      const subText = `📜 ${state.questBanner.questTitle} : ${state.questBanner.objectiveText} (${state.questBanner.progressText})`;
      ctx.font = '800 11px system-ui, sans-serif';
      const subW = Math.min(bannerW, Math.max(260, ctx.measureText(subText).width + 36));
      this.drawSkewedPill(
        bannerCenterX,
        stackCenterY + 4,
        subW,
        24,
        7,
        -0.1,
        '#0f172a',
        '#090d16',
        '#38bdf8',
        2.5
      );
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText(subText, bannerCenterX, stackCenterY + 4.5, '#e2e8f0', 2.5);
      stackCenterY += 28;
    }
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

    if (state.hintText && state.hintText.trim().length > 0) {
      const rawHint = state.hintText.trim();
      const hintLabel = rawHint.startsWith('💡') ? rawHint : `💡 ${rawHint}`;
      let hintFontSize = 12;
      ctx.font = `800 ${hintFontSize}px system-ui, sans-serif`;
      const maxHintW = Math.min(540, cssW - 48);
      const measuredW = ctx.measureText(hintLabel).width;
      if (measuredW > maxHintW - 34 && measuredW > 0) {
        hintFontSize = Math.max(10, Math.floor((hintFontSize * (maxHintW - 34)) / measuredW));
        ctx.font = `800 ${hintFontSize}px system-ui, sans-serif`;
      }
      const hintW = Math.min(maxHintW, Math.max(220, ctx.measureText(hintLabel).width + 36));
      this.drawSkewedPill(
        bannerCenterX,
        stackCenterY + 6,
        hintW,
        26,
        7,
        -0.1,
        '#92400e',
        '#451a03',
        '#fde047',
        2.5
      );
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.drawOutlinedText(hintLabel, bannerCenterX, stackCenterY + 6.5, '#fef9c3', 2.8);
      stackCenterY += 32;
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
