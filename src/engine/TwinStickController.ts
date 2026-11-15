import type { IRenderJoystick, IRenderVec2 } from './IsometricRenderer';

export interface ITwinStickFireCommand {
  angle: number;
}

const STICK_MAX_RADIUS = 48;

/**
 * Contrôleur Double Stick Tactile + Clavier/Souris (Zéro Friction Scolaire).
 * - Pouce gauche (ou ZQSD/Flèches) : déplacement omnidirectionnel fluide
 * - Pouce droit (ou souris) : vecteur de visée et déclenchement du tir
 * - Boutons / touches : Super (jaune / Espace) et Gadget (vert / E)
 */
export class TwinStickController {
  private readonly canvas: HTMLCanvasElement;
  private readonly screenToWorldFn: (sx: number, sy: number) => IRenderVec2;
  private readonly getPlayerWorldFn: () => IRenderVec2;

  private leftPointerId: number | null = null;
  private rightPointerId: number | null = null;

  private leftStick: IRenderJoystick = {
    active: false,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    color: '#38bdf8',
  };

  private rightStick: IRenderJoystick = {
    active: false,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    color: '#facc15',
  };

  private readonly keysPressed = new Set<string>();
  private aimAngle = -Math.PI / 2;
  private pendingFire: ITwinStickFireCommand | null = null;
  private pendingSuper = false;
  private pendingGadget = false;
  private attached = false;

  constructor(
    canvas: HTMLCanvasElement,
    screenToWorldFn: (sx: number, sy: number) => IRenderVec2,
    getPlayerWorldFn: () => IRenderVec2
  ) {
    this.canvas = canvas;
    this.screenToWorldFn = screenToWorldFn;
    this.getPlayerWorldFn = getPlayerWorldFn;
  }

  public attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.keysPressed.clear();
  }

  public requestSuper(): void {
    this.pendingSuper = true;
  }

  public requestGadget(): void {
    this.pendingGadget = true;
  }

  public requestAutoFire(angle?: number): void {
    this.pendingFire = { angle: angle ?? this.aimAngle };
  }

  public getMoveVector(): IRenderVec2 {
    let dx = 0;
    let dy = 0;

    if (this.leftStick.active) {
      dx = (this.leftStick.currentX - this.leftStick.originX) / STICK_MAX_RADIUS;
      dy = (this.leftStick.currentY - this.leftStick.originY) / STICK_MAX_RADIUS;
    }

    if (this.keysPressed.has('KeyA') || this.keysPressed.has('KeyQ') || this.keysPressed.has('ArrowLeft')) {
      dx -= 1;
    }
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
      dx += 1;
    }
    if (this.keysPressed.has('KeyW') || this.keysPressed.has('KeyZ') || this.keysPressed.has('ArrowUp')) {
      dy -= 1;
    }
    if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
      dy += 1;
    }

    const len = Math.hypot(dx, dy);
    if (len > 1) {
      return { x: dx / len, y: dy / len };
    }
    return { x: dx, y: dy };
  }

  public getAimAngle(): number {
    return this.aimAngle;
  }

  public consumeFireCommand(): ITwinStickFireCommand | null {
    const cmd = this.pendingFire;
    this.pendingFire = null;
    return cmd;
  }

  public consumeSuperCommand(): boolean {
    const val = this.pendingSuper;
    this.pendingSuper = false;
    return val;
  }

  public consumeGadgetCommand(): boolean {
    const val = this.pendingGadget;
    this.pendingGadget = false;
    return val;
  }

  public getLeftStickRender(): IRenderJoystick {
    return { ...this.leftStick };
  }

  public getRightStickRender(): IRenderJoystick {
    return { ...this.rightStick };
  }

  private readonly onPointerDown = (ev: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    // Souris desktop : clic gauche vise directement vers le curseur et tire
    if (ev.pointerType === 'mouse') {
      const worldTarget = this.screenToWorldFn(x, y);
      const playerPos = this.getPlayerWorldFn();
      this.aimAngle = Math.atan2(worldTarget.y - playerPos.y, worldTarget.x - playerPos.x);
      this.pendingFire = { angle: this.aimAngle };
      return;
    }

    // Tactile : moitié gauche = stick déplacement, moitié droite = stick de tir
    if (x < rect.width * 0.5 && this.leftPointerId === null) {
      this.leftPointerId = ev.pointerId;
      this.leftStick = {
        ...this.leftStick,
        active: true,
        originX: x,
        originY: y,
        currentX: x,
        currentY: y,
      };
    } else if (x >= rect.width * 0.5 && this.rightPointerId === null) {
      this.rightPointerId = ev.pointerId;
      this.rightStick = {
        ...this.rightStick,
        active: true,
        originX: x,
        originY: y,
        currentX: x,
        currentY: y,
      };
    }
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

    if (ev.pointerType === 'mouse') {
      const worldTarget = this.screenToWorldFn(x, y);
      const playerPos = this.getPlayerWorldFn();
      this.aimAngle = Math.atan2(worldTarget.y - playerPos.y, worldTarget.x - playerPos.x);
      return;
    }

    if (ev.pointerId === this.leftPointerId) {
      const clamped = this.clampStick(this.leftStick.originX, this.leftStick.originY, x, y);
      this.leftStick.currentX = clamped.x;
      this.leftStick.currentY = clamped.y;
    } else if (ev.pointerId === this.rightPointerId) {
      const clamped = this.clampStick(this.rightStick.originX, this.rightStick.originY, x, y);
      this.rightStick.currentX = clamped.x;
      this.rightStick.currentY = clamped.y;
      const dx = clamped.x - this.rightStick.originX;
      const dy = clamped.y - this.rightStick.originY;
      if (Math.hypot(dx, dy) > 8) {
        this.aimAngle = Math.atan2(dy, dx);
      }
    }
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    if (ev.pointerId === this.leftPointerId) {
      this.leftPointerId = null;
      this.leftStick.active = false;
    } else if (ev.pointerId === this.rightPointerId) {
      const dx = this.rightStick.currentX - this.rightStick.originX;
      const dy = this.rightStick.currentY - this.rightStick.originY;
      if (Math.hypot(dx, dy) > 10) {
        this.aimAngle = Math.atan2(dy, dx);
      }
      this.pendingFire = { angle: this.aimAngle };
      this.rightPointerId = null;
      this.rightStick.active = false;
    }
  };

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    this.keysPressed.add(ev.code);
    if (ev.code === 'Space') {
      ev.preventDefault();
      this.pendingSuper = true;
    } else if (ev.code === 'KeyE' || ev.code === 'KeyG') {
      this.pendingGadget = true;
    } else if (ev.code === 'KeyF') {
      this.pendingFire = { angle: this.aimAngle };
    }
  };

  private readonly onKeyUp = (ev: KeyboardEvent): void => {
    this.keysPressed.delete(ev.code);
  };

  private clampStick(ox: number, oy: number, cx: number, cy: number): IRenderVec2 {
    const dx = cx - ox;
    const dy = cy - oy;
    const dist = Math.hypot(dx, dy);
    if (dist <= STICK_MAX_RADIUS) {
      return { x: cx, y: cy };
    }
    const ratio = STICK_MAX_RADIUS / dist;
    return {
      x: ox + dx * ratio,
      y: oy + dy * ratio,
    };
  }
}
