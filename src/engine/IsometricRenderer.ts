import * as THREE from 'three';
import type { BrawlerId, GameModeId } from '../types/cctp';
import {
  animateBrawler3DRig,
  createBrawler3DModel,
  createTarget3DModel,
  disposeObject3D,
  type IBrawler3DRig,
} from '../entities/Brawler3DModel';

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
  turretPos?: IRenderVec2 | null;
  compassTargetPos?: IRenderVec2 | null;
  flashBubble: IRenderFlashBubble | null;
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
  private builtArenaKey = '';

  private playerRig: IBrawler3DRig | null = null;
  private prevPlayerX = 0;
  private prevPlayerY = 0;
  private moveHoldMs = 0;
  private lastRenderMs = performance.now();

  private readonly targetMeshes = new Map<string, ICachedTarget3D>();
  private readonly projectilePool: THREE.Mesh[] = [];
  private readonly projectileGeo = new THREE.SphereGeometry(0.24, 10, 10);
  private turretMesh3D: THREE.Group | null = null;

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
      sunLight.position.set(16, 28, 18);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      sunLight.shadow.camera.near = 2;
      sunLight.shadow.camera.far = 70;
      sunLight.shadow.camera.left = -20;
      sunLight.shadow.camera.right = 20;
      sunLight.shadow.camera.top = 20;
      sunLight.shadow.camera.bottom = -20;
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
      this.webglRenderer = renderer;
      this.scene = scene;
      this.camera3D = camera;
      this.arenaGroup = arenaGroup;
      this.turretMesh3D = turretGroup;
      this.webglReady = true;
    } catch {
      this.webglReady = false;
    }
  }

  public dispose(): void {
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
    this.webglRenderer?.dispose();
    this.webglRenderer = null;
    this.webglCanvas = null;
    this.scene = null;
    this.camera3D = null;
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
    const dx = (wx - this.cameraX) * this.zoom;
    const dy = (wy - this.cameraY) * ISO_Y_SCALE * this.zoom - wz * this.zoom;

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

    // Caméra verrouillée sur le joueur avec léger lissage
    this.cameraX += (state.player.x - this.cameraX) * 0.18;
    this.cameraY += (state.player.y - this.cameraY) * 0.18;

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

    const ctx = this.ctx;
    ctx.clearRect(0, 0, cssW, cssH);

    if (this.webglReady && this.webglRenderer && this.scene && this.camera3D && this.webglCanvas) {
      this.renderThreeScene(state, cssW, cssH, nowMs / 1000);
      ctx.drawImage(this.webglCanvas, 0, 0, cssW, cssH);
      this.draw2DOverlaysOn3D(state);
    } else {
      this.render2DFallback(state, cssW, cssH);
    }

    this.drawJoysticks(state.leftStick, state.rightStick);
    this.drawHudOverlay(state, cssW);
  }

  private renderThreeScene(
    state: IRenderFrameState,
    cssW: number,
    cssH: number,
    timeSec: number
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
    const lookX = this.cameraX * WORLD_SCALE_3D;
    const lookZ = this.cameraY * WORLD_SCALE_3D - upwardBias3d;
    const camDist = 36;
    this.camera3D.position.set(
      lookX,
      camDist * Math.sin(ISO_ANGLE_RAD),
      lookZ + camDist * Math.cos(ISO_ANGLE_RAD)
    );
    this.camera3D.lookAt(lookX, 0, lookZ);
    this.camera3D.updateMatrixWorld();

    // Sol & obstacles 3D (reconstruits uniquement au changement de mode)
    const arenaKey = `${state.modeId}_${state.obstacles.length}`;
    if (this.builtArenaKey !== arenaKey) {
      this.rebuildArena3D(state);
      this.builtArenaKey = arenaKey;
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

    // Cour du collège 3D
    const floorColor = state.modeId === 'MATCH_DES_ACCORDS' ? 0x166534 : 0x334155;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w3d, h3d),
      new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.85 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w3d * 0.5, 0, h3d * 0.5);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Quadrillage & bordures dorées
    const grid = new THREE.GridHelper(Math.max(w3d, h3d), 16, 0x64748b, 0x475569);
    grid.position.set(w3d * 0.5, 0.01, h3d * 0.5);
    grid.scale.set(w3d / Math.max(w3d, h3d), 1, h3d / Math.max(w3d, h3d));
    this.arenaGroup.add(grid);

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

    // Obstacles 3D volumétriques
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
    if (state.shrinkRadius !== undefined) {
      this.drawShrinkZone(state.arenaWidth * 0.5, state.arenaHeight * 0.5, state.shrinkRadius);
    }
    if (state.laserSweepY !== undefined) {
      this.drawLaserSweep(state.arenaWidth, state.laserSweepY);
    }
    if (state.compassTargetPos) {
      this.drawCompassArrow(state.player, state.compassTargetPos);
    }
    for (const obs of state.obstacles) {
      if (!obs.label) continue;
      const p = this.worldToScreen(obs.x + obs.width * 0.5, obs.y + obs.height * 0.5, 16);
      this.ctx.save();
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = `bold ${Math.max(12, Math.round(14 * this.zoom))}px system-ui, sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(obs.label, p.x, p.y);
      this.ctx.restore();
    }
    for (const target of state.targets) {
      this.drawTargetOverlay(target);
    }
    this.drawPlayerOverlay(state.player);
    if (state.flashBubble) {
      this.drawFlashBubble(state.flashBubble);
    }
  }

  private drawTargetOverlay(target: IRenderTarget): void {
    const ctx = this.ctx;
    const headPos = this.worldToScreen(target.x, target.y, target.isBoss ? 86 : 56);
    const fontSize = Math.max(13, Math.round(15 * this.zoom));

    ctx.save();
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    const metrics = ctx.measureText(target.label);
    const pillW = Math.max(58 * this.zoom, metrics.width + 20 * this.zoom);
    const pillH = 26 * this.zoom;
    const pillX = headPos.x - pillW * 0.5;
    const pillY = headPos.y - pillH - 12 * this.zoom;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = target.highlighted ? '#facc15' : '#e2e8f0';
    ctx.lineWidth = target.highlighted ? 3 : 2;
    this.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(target.label, headPos.x, pillY + pillH * 0.5);

    // Barre de PV cible
    const hpRatio = Math.max(0, Math.min(1, target.hp / target.maxHp));
    const barW = 48 * this.zoom;
    const barH = 6 * this.zoom;
    const barX = headPos.x - barW * 0.5;
    const barY = headPos.y - 6 * this.zoom;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);
    ctx.restore();
  }

  private drawPlayerOverlay(player: IRenderPlayer): void {
    const ctx = this.ctx;
    const headPos = this.worldToScreen(player.x, player.y, 76);
    const barW = 66 * this.zoom;
    const barH = 7 * this.zoom;
    const barX = headPos.x - barW * 0.5;
    const barY = headPos.y - 10 * this.zoom;

    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#22c55e';
    const hpRatio = Math.max(0, Math.min(1, player.hp / player.maxHp));
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    // 3 barres de munitions
    const ammoW = (barW - 4) / player.maxAmmoBars;
    for (let i = 0; i < player.maxAmmoBars; i++) {
      const fill = Math.max(0, Math.min(1, player.ammoBars - i));
      ctx.fillStyle = '#334155';
      ctx.fillRect(barX + i * (ammoW + 2), barY + barH + 3, ammoW, 4 * this.zoom);
      if (fill > 0) {
        ctx.fillStyle = fill >= 1 ? '#fb923c' : '#fed7aa';
        ctx.fillRect(barX + i * (ammoW + 2), barY + barH + 3, ammoW * fill, 4 * this.zoom);
      }
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = `bold ${Math.round(12 * this.zoom)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(player.name, headPos.x, barY - 7 * this.zoom);
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

    if (state.shrinkRadius !== undefined) {
      this.drawShrinkZone(state.arenaWidth * 0.5, state.arenaHeight * 0.5, state.shrinkRadius);
    }
    if (state.laserSweepY !== undefined) {
      this.drawLaserSweep(state.arenaWidth, state.laserSweepY);
    }
    if (state.turretPos) {
      this.drawTurret(state.turretPos);
    }
    if (state.compassTargetPos) {
      this.drawCompassArrow(state.player, state.compassTargetPos);
    }

    const sortedTargets = [...state.targets].sort((a, b) => a.y - b.y);
    for (const target of sortedTargets) {
      this.drawTarget2D(target);
    }

    this.drawPlayer2D(state.player);

    for (const proj of state.projectiles) {
      this.drawProjectile2D(proj);
    }

    if (state.flashBubble) {
      this.drawFlashBubble(state.flashBubble);
    }
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
      if (obs.label) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(obs.label, tl.x + w * 0.5, tl.y + h * 0.5);
      }
      ctx.restore();
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

  private drawLaserSweep(arenaWidth: number, laserY: number): void {
    const ctx = this.ctx;
    const left = this.worldToScreen(0, laserY, 10);
    const right = this.worldToScreen(arenaWidth, laserY, 10);
    ctx.save();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = 10 * this.zoom;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
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

  private drawTarget2D(target: IRenderTarget): void {
    const ctx = this.ctx;
    const screen = this.worldToScreen(target.x, target.y, 12);
    const r = target.radius * this.zoom;
    ctx.save();
    ctx.fillStyle = target.isCrystal ? '#38bdf8' : target.isBoss ? '#dc2626' : '#f97316';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.drawTargetOverlay(target);
  }

  private drawPlayer2D(player: IRenderPlayer): void {
    const ctx = this.ctx;
    const screen = this.worldToScreen(player.x, player.y, 14);
    const palette = BRAWLER_COLORS[player.brawlerId];
    const r = 24 * this.zoom;
    ctx.save();
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
    const p = this.worldToScreen(bubble.x, bubble.y, 70);
    ctx.save();
    ctx.font = 'bold 14px system-ui, sans-serif';
    const w = Math.min(360, ctx.measureText(bubble.text).width + 28);
    const h = 34;
    ctx.fillStyle = bubble.isPositive ? 'rgba(21,128,61,0.95)' : 'rgba(185,28,28,0.95)';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    this.roundRect(p.x - w * 0.5, p.y - h - 18, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bubble.text, p.x, p.y - h * 0.5 - 18);
    ctx.restore();
  }

  private drawJoysticks(left: IRenderJoystick, right: IRenderJoystick): void {
    for (const stick of [left, right]) {
      if (!stick.active) continue;
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = stick.color;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(stick.originX, stick.originY, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = stick.color;
      ctx.beginPath();
      ctx.arc(stick.currentX, stick.currentY, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawHudOverlay(state: IRenderFrameState, cssW: number): void {
    const ctx = this.ctx;
    ctx.save();

    const bannerW = Math.min(540, cssW * 0.62);
    const bannerH = 44;
    const bannerX = (cssW - bannerW) * 0.5;
    const bannerY = 12;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    this.roundRect(bannerX, bannerY, bannerW, bannerH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(state.hudPrompt, cssW * 0.5, bannerY + bannerH * 0.5);

    const mins = Math.floor(state.remainingSeconds / 60);
    const secs = Math.floor(state.remainingSeconds % 60);
    const timeText = `${mins}:${secs.toString().padStart(2, '0')}`;

    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    this.roundRect(14, 12, 165, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`⏱ ${timeText}  |  ${state.objectiveLabel}: ${state.objectiveScore}`, 24, 34);

    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    this.roundRect(cssW - 190, 12, 176, 44, 10);
    ctx.fill();
    ctx.fillStyle = state.player.superGaugePct >= 100 ? '#facc15' : '#38bdf8';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `x${state.player.comboMultiplier.toFixed(2)} | SUPER ${Math.round(state.player.superGaugePct)}%`,
      cssW - 24,
      34
    );

    ctx.restore();
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
