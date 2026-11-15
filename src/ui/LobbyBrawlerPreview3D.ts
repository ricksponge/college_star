import * as THREE from 'three';
import type { BrawlerId } from '../types/cctp';
import {
  animateBrawler3DRig,
  createBrawler3DModel,
  disposeObject3D,
  type IBrawler3DRig,
} from '../entities/Brawler3DModel';

/**
 * Aperçu 3D temps réel interactif du héros sélectionné dans le Lobby (Three.js).
 */
export class LobbyBrawlerPreview3D {
  private readonly container: HTMLElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rig: IBrawler3DRig | null = null;
  private rafId: number | null = null;

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
      camera.position.set(0, 1.85, 4.1);
      camera.lookAt(0, 0.95, 0);

      const hemiLight = new THREE.HemisphereLight(0xfef9c3, 0x1e293b, 1.15);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
      dirLight.position.set(3, 6, 4);
      scene.add(dirLight);

      const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
      rimLight.position.set(-4, 3, -3);
      scene.add(rimLight);

      // Socle circulaire du collège / stade
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.15, 0.16, 32),
        new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.4,
          metalness: 0.3,
        })
      );
      pedestal.position.y = -0.08;
      scene.add(pedestal);

      const pedestalRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.04, 0.035, 8, 36),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      pedestalRing.rotation.x = Math.PI / 2;
      pedestalRing.position.y = 0.01;
      scene.add(pedestalRing);

      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;

      this.setBrawler(initialBrawler);
      this.attachPointerControls(renderer.domElement);
      this.startLoop();
    } catch {
      this.container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">Aperçu 3D prêt</div>';
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
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
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
  }

  private attachPointerControls(dom: HTMLCanvasElement): void {
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private detachPointerControls(dom: HTMLCanvasElement): void {
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
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
      const t = nowMs / 1000;
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
