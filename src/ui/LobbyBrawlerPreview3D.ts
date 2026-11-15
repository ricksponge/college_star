import * as THREE from 'three';
import type { BrawlerId } from '../types/cctp';
import {
  animateBrawler3DRig,
  createBrawler3DModel,
  disposeObject3D,
  type IBrawler3DRig,
} from '../entities/Brawler3DModel';

interface IBrawlerAccentTheme {
  primary: number;
  secondary: number;
  rim: number;
}

interface ISparkParticle {
  mesh: THREE.Mesh;
  angleOffset: number;
  radius: number;
  baseHeight: number;
  orbitSpeed: number;
  bobSpeed: number;
  bobAmp: number;
  baseScale: number;
  spinSpeed: number;
}

const DEFAULT_ACCENT_THEME: IBrawlerAccentTheme = {
  primary: 0x38bdf8,
  secondary: 0xfacc15,
  rim: 0x38bdf8,
};

const BRAWLER_ACCENT_THEMES: Record<string, IBrawlerAccentTheme> = {
  TIMO: { primary: 0x38bdf8, secondary: 0xfacc15, rim: 0x60a5fa },
  LEO: { primary: 0xc084fc, secondary: 0xf472b6, rim: 0xd8b4fe },
  MAYA: { primary: 0xf59e0b, secondary: 0xfef08a, rim: 0xfbbf24 },
  ZACK: { primary: 0x4ade80, secondary: 0x22d3ee, rim: 0x34d399 },
};

/**
 * Aperçu 3D temps réel interactif du héros sélectionné dans le Lobby (Three.js).
 * Inclut un podium esports double-anneau rotatif, un rim light dynamique par héros
 * et des particules d'étoiles/étincelles en orbite douce.
 */
export class LobbyBrawlerPreview3D {
  private readonly container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rig: IBrawler3DRig | null = null;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private rimLight: THREE.DirectionalLight | null = null;
  private podiumGlowLight: THREE.PointLight | null = null;
  private outerRingGroup: THREE.Group | null = null;
  private innerRingGroup: THREE.Group | null = null;
  private outerRingMat: THREE.MeshBasicMaterial | null = null;
  private innerRingMat: THREE.MeshBasicMaterial | null = null;
  private energyDiscMat: THREE.MeshBasicMaterial | null = null;
  private floorHaloMat: THREE.MeshBasicMaterial | null = null;
  private sparkPrimaryMat: THREE.MeshBasicMaterial | null = null;
  private sparkSecondaryMat: THREE.MeshBasicMaterial | null = null;
  private sparks: ISparkParticle[] = [];

  private readonly currentPrimaryColor = new THREE.Color(DEFAULT_ACCENT_THEME.primary);
  private readonly currentSecondaryColor = new THREE.Color(DEFAULT_ACCENT_THEME.secondary);
  private readonly currentRimColor = new THREE.Color(DEFAULT_ACCENT_THEME.rim);
  private readonly targetPrimaryColor = new THREE.Color(DEFAULT_ACCENT_THEME.primary);
  private readonly targetSecondaryColor = new THREE.Color(DEFAULT_ACCENT_THEME.secondary);
  private readonly targetRimColor = new THREE.Color(DEFAULT_ACCENT_THEME.rim);
  private themeInitialized = false;

  private lastFrameMs = 0;
  private userRotationOffset = 0;
  private isDragging = false;
  private lastPointerX = 0;
  private disposed = false;

  constructor(container: HTMLElement, initialBrawler: BrawlerId) {
    this.container = container;
    this.initScene(initialBrawler);
  }

  private initScene(initialBrawler: BrawlerId): void {
    const width = Math.max(220, this.container.clientWidth || 260);
    const height = Math.max(190, this.container.clientHeight || 210);

    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.cursor = 'grab';
      this.container.innerHTML = '';
      this.container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 40);
      camera.position.set(0, 1.9, 4.25);
      camera.lookAt(0, 0.92, 0);

      const hemiLight = new THREE.HemisphereLight(0xfef9c3, 0x172554, 1.15);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.35);
      dirLight.position.set(3, 6, 4);
      scene.add(dirLight);

      const rimLight = new THREE.DirectionalLight(DEFAULT_ACCENT_THEME.rim, 1.15);
      rimLight.position.set(-3.8, 3.2, -2.8);
      scene.add(rimLight);
      this.rimLight = rimLight;

      const podiumGlowLight = new THREE.PointLight(DEFAULT_ACCENT_THEME.primary, 1.6, 7.5);
      podiumGlowLight.position.set(0, 0.45, 0.35);
      scene.add(podiumGlowLight);
      this.podiumGlowLight = podiumGlowLight;

      this.buildEsportsPodium(scene);
      this.buildOrbitingSparks(scene);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;

      this.setBrawler(initialBrawler);
      this.attachPointerControls(renderer.domElement);
      this.attachResizeObserver();
      this.startLoop();
    } catch {
      this.container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">Aperçu 3D prêt</div>';
    }
  }

  private buildEsportsPodium(scene: THREE.Scene): void {
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.06, 1.18, 0.18, 40),
      new THREE.MeshStandardMaterial({
        color: 0x131d47,
        roughness: 0.34,
        metalness: 0.45,
      })
    );
    pedestal.position.y = -0.09;
    scene.add(pedestal);

    const lowerTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.24, 0.05, 40),
      new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.5,
        metalness: 0.6,
      })
    );
    lowerTrim.position.y = -0.17;
    scene.add(lowerTrim);

    this.energyDiscMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_ACCENT_THEME.primary,
      transparent: true,
      opacity: 0.22,
    });
    const energyDisc = new THREE.Mesh(new THREE.CircleGeometry(0.98, 40), this.energyDiscMat);
    energyDisc.rotation.x = -Math.PI / 2;
    energyDisc.position.y = 0.004;
    scene.add(energyDisc);

    this.floorHaloMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_ACCENT_THEME.primary,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const floorHalo = new THREE.Mesh(new THREE.RingGeometry(1.22, 1.48, 48), this.floorHaloMat);
    floorHalo.rotation.x = -Math.PI / 2;
    floorHalo.position.y = -0.185;
    scene.add(floorHalo);

    // Anneau externe rotatif + 6 balises esports
    const outerRingGroup = new THREE.Group();
    this.outerRingMat = new THREE.MeshBasicMaterial({ color: DEFAULT_ACCENT_THEME.secondary });
    const outerTorus = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.032, 10, 48),
      this.outerRingMat
    );
    outerTorus.rotation.x = Math.PI / 2;
    outerTorus.position.y = 0.012;
    outerRingGroup.add(outerTorus);

    const nodeGeom = new THREE.BoxGeometry(0.14, 0.052, 0.064);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const node = new THREE.Mesh(nodeGeom, this.outerRingMat);
      node.position.set(Math.cos(angle) * 1.11, 0.022, Math.sin(angle) * 1.11);
      node.rotation.y = -angle;
      outerRingGroup.add(node);
    }
    scene.add(outerRingGroup);
    this.outerRingGroup = outerRingGroup;

    // Anneau interne contre-rotatif + 4 cristaux de repère
    const innerRingGroup = new THREE.Group();
    this.innerRingMat = new THREE.MeshBasicMaterial({ color: DEFAULT_ACCENT_THEME.primary });
    const innerTorus = new THREE.Mesh(
      new THREE.TorusGeometry(0.81, 0.02, 8, 36),
      this.innerRingMat
    );
    innerTorus.rotation.x = Math.PI / 2;
    innerTorus.position.y = 0.02;
    innerRingGroup.add(innerTorus);

    const diamondGeom = new THREE.OctahedronGeometry(0.052, 0);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI * 2) / 4;
      const diamond = new THREE.Mesh(diamondGeom, this.innerRingMat);
      diamond.position.set(Math.cos(angle) * 0.81, 0.036, Math.sin(angle) * 0.81);
      innerRingGroup.add(diamond);
    }
    scene.add(innerRingGroup);
    this.innerRingGroup = innerRingGroup;
  }

  private buildOrbitingSparks(scene: THREE.Scene): void {
    const sparkGeom = new THREE.OctahedronGeometry(0.038, 0);
    this.sparkPrimaryMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_ACCENT_THEME.primary,
      transparent: true,
      opacity: 0.88,
    });
    this.sparkSecondaryMat = new THREE.MeshBasicMaterial({
      color: DEFAULT_ACCENT_THEME.secondary,
      transparent: true,
      opacity: 0.92,
    });

    const sparkCount = 14;
    this.sparks = [];
    for (let i = 0; i < sparkCount; i++) {
      const isSecondary = i % 2 === 1;
      const mesh = new THREE.Mesh(
        sparkGeom,
        isSecondary ? this.sparkSecondaryMat : this.sparkPrimaryMat
      );
      const baseScale = 0.68 + ((i * 37) % 10) * 0.055;
      mesh.scale.set(baseScale * 0.82, baseScale * 1.38, baseScale * 0.82);
      scene.add(mesh);

      this.sparks.push({
        mesh,
        angleOffset: i * 2.39996,
        radius: 1.02 + (i % 4) * 0.13,
        baseHeight: 0.24 + ((i * 5) % 14) * 0.105,
        orbitSpeed: (i % 2 === 0 ? 0.42 : -0.34) * (0.85 + (i % 3) * 0.14),
        bobSpeed: 1.4 + (i % 5) * 0.28,
        bobAmp: 0.065 + (i % 3) * 0.025,
        baseScale,
        spinSpeed: 1.8 + (i % 4) * 0.45,
      });
    }
  }

  public setBrawler(brawlerId: BrawlerId): void {
    if (!this.scene) return;
    if (this.rig) {
      this.scene.remove(this.rig.root);
      disposeObject3D(this.rig.root);
      this.rig = null;
    }
    this.rig = createBrawler3DModel(brawlerId);
    this.rig.root.scale.setScalar(1.1);
    this.scene.add(this.rig.root);

    const theme = BRAWLER_ACCENT_THEMES[brawlerId] ?? DEFAULT_ACCENT_THEME;
    this.targetPrimaryColor.setHex(theme.primary);
    this.targetSecondaryColor.setHex(theme.secondary);
    this.targetRimColor.setHex(theme.rim);

    if (!this.themeInitialized) {
      this.currentPrimaryColor.copy(this.targetPrimaryColor);
      this.currentSecondaryColor.copy(this.targetSecondaryColor);
      this.currentRimColor.copy(this.targetRimColor);
      this.applyAccentColors();
      this.themeInitialized = true;
    }
  }

  private applyAccentColors(): void {
    this.rimLight?.color.copy(this.currentRimColor);
    this.podiumGlowLight?.color.copy(this.currentPrimaryColor);
    this.outerRingMat?.color.copy(this.currentSecondaryColor);
    this.innerRingMat?.color.copy(this.currentPrimaryColor);
    this.energyDiscMat?.color.copy(this.currentPrimaryColor);
    this.floorHaloMat?.color.copy(this.currentPrimaryColor);
    this.sparkPrimaryMat?.color.copy(this.currentPrimaryColor);
    this.sparkSecondaryMat?.color.copy(this.currentSecondaryColor);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.renderer) {
      this.detachPointerControls(this.renderer.domElement);
      if (this.scene) {
        disposeObject3D(this.scene);
      }
      this.renderer.dispose();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.rig = null;
    this.rimLight = null;
    this.podiumGlowLight = null;
    this.outerRingGroup = null;
    this.innerRingGroup = null;
    this.outerRingMat = null;
    this.innerRingMat = null;
    this.energyDiscMat = null;
    this.floorHaloMat = null;
    this.sparkPrimaryMat = null;
    this.sparkSecondaryMat = null;
    this.sparks = [];
  }

  private attachResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (this.disposed || !this.renderer || !this.camera) return;
      const w = Math.max(220, this.container.clientWidth || 260);
      const h = Math.max(190, this.container.clientHeight || 210);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
    this.resizeObserver.observe(this.container);
  }

  private attachPointerControls(dom: HTMLCanvasElement): void {
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  private detachPointerControls(dom: HTMLCanvasElement): void {
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }

  private readonly onPointerDown = (ev: PointerEvent): void => {
    this.isDragging = true;
    this.lastPointerX = ev.clientX;
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (!this.isDragging) return;
    const dx = ev.clientX - this.lastPointerX;
    this.lastPointerX = ev.clientX;
    this.userRotationOffset += dx * 0.015;
  };

  private readonly onPointerUp = (): void => {
    this.isDragging = false;
  };

  private startLoop(): void {
    const tick = (nowMs: number): void => {
      if (this.disposed || !this.renderer || !this.scene || !this.camera) return;
      const dt = this.lastFrameMs > 0 ? Math.min(0.05, (nowMs - this.lastFrameMs) / 1000) : 0.016;
      this.lastFrameMs = nowMs;
      const t = nowMs / 1000;

      // Transition fluide des couleurs du podium et du rim light lors d'un changement de héros
      const colorLerp = Math.min(1, dt * 7);
      this.currentPrimaryColor.lerp(this.targetPrimaryColor, colorLerp);
      this.currentSecondaryColor.lerp(this.targetSecondaryColor, colorLerp);
      this.currentRimColor.lerp(this.targetRimColor, colorLerp);
      this.applyAccentColors();

      if (this.outerRingGroup) {
        this.outerRingGroup.rotation.y = t * 0.55;
      }
      if (this.innerRingGroup) {
        this.innerRingGroup.rotation.y = -t * 0.85;
      }
      if (this.energyDiscMat) {
        this.energyDiscMat.opacity = 0.2 + Math.sin(t * 2.6) * 0.05;
      }
      if (this.podiumGlowLight) {
        this.podiumGlowLight.intensity = 1.5 + Math.sin(t * 2.6) * 0.25;
      }

      for (const spark of this.sparks) {
        const theta = spark.angleOffset + t * spark.orbitSpeed;
        const bob = Math.sin(t * spark.bobSpeed + spark.angleOffset) * spark.bobAmp;
        const pulse = 0.88 + 0.24 * Math.sin(t * 3.1 + spark.angleOffset);
        spark.mesh.position.set(
          Math.cos(theta) * spark.radius,
          spark.baseHeight + bob,
          Math.sin(theta) * spark.radius
        );
        spark.mesh.rotation.y = t * spark.spinSpeed;
        spark.mesh.rotation.z = Math.sin(t * 1.7 + spark.angleOffset) * 0.35;
        spark.mesh.scale.set(
          spark.baseScale * 0.82 * pulse,
          spark.baseScale * 1.38 * pulse,
          spark.baseScale * 0.82 * pulse
        );
      }

      if (this.rig) {
        const autoSpin = this.isDragging ? 0 : t * 0.65;
        animateBrawler3DRig(this.rig, {
          timeSec: t,
          isMoving: false,
          aimAngle: Math.PI / 2 - (autoSpin + this.userRotationOffset),
          superReady: false,
          hasShield: false,
          isErrorShield: false,
        });
      }
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }
}
