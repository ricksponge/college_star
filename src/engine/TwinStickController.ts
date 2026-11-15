import { ISO_Y_SCALE, type IRenderJoystick, type IRenderVec2 } from './IsometricRenderer';

export interface ITwinStickFireCommand {
  angle: number;
  autoAim?: boolean;
  targetWorldPos?: IRenderVec2;
}

const STICK_MAX_RADIUS = 48;
const STICK_DEADZONE = 8;
const CANCEL_ZONE_RADIUS = 12;
const AIM_ACTIVATION_DIST = 14;

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
  private readonly findTargetAtScreenPos?: (sx: number, sy: number) => IRenderVec2 | null;

  private leftPointerId: number | null = null;
  private rightPointerId: number | null = null;
  private mouseDownAiming = false;
  private mouseAimDragged = false;
  private mouseDownPos: IRenderVec2 = { x: 0, y: 0 };

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
  private rightStickMaxDist = 0;
  private pendingFire: ITwinStickFireCommand | null = null;
  private pendingSuper = false;
  private pendingGadget = false;
  private attached = false;

  constructor(
    canvas: HTMLCanvasElement,
    screenToWorldFn: (sx: number, sy: number) => IRenderVec2,
    getPlayerWorldFn: () => IRenderVec2,
    findTargetAtScreenPos?: (sx: number, sy: number) => IRenderVec2 | null
  ) {
    this.canvas = canvas;
    this.screenToWorldFn = screenToWorldFn;
    this.getPlayerWorldFn = getPlayerWorldFn;
    this.findTargetAtScreenPos = findTargetAtScreenPos;
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
    this.mouseDownAiming = false;
    this.mouseAimDragged = false;
    this.leftPointerId = null;
    this.rightPointerId = null;
    this.leftStick.active = false;
    this.rightStick.active = false;
  }

  public requestSuper(): void {
    this.pendingSuper = true;
  }

  public requestGadget(): void {
    this.pendingGadget = true;
  }

  public isAiming(): boolean {
    if (this.mouseDownAiming) return true;
    if (!this.rightStick.active) return false;
    const dx = this.rightStick.currentX - this.rightStick.originX;
    const dy = this.rightStick.currentY - this.rightStick.originY;
    return Math.hypot(dx, dy) >= CANCEL_ZONE_RADIUS;
  }

  public isCancellingAim(): boolean {
    if (!this.rightStick.active) return false;
    const dx = this.rightStick.currentX - this.rightStick.originX;
    const dy = this.rightStick.currentY - this.rightStick.originY;
    const currentDist = Math.hypot(dx, dy);
    return this.rightStickMaxDist > AIM_ACTIVATION_DIST && currentDist < CANCEL_ZONE_RADIUS;
  }

  public requestAutoFire(angle?: number): void {
    this.pendingFire = {
      angle: angle ?? this.aimAngle,
      autoAim: angle === undefined,
    };
  }

  public getMoveVector(): IRenderVec2 {
    let dx = 0;
    let dy = 0;

    if (this.leftStick.active) {
      const rawDx = this.leftStick.currentX - this.leftStick.originX;
      const rawDy = this.leftStick.currentY - this.leftStick.originY;
      const rawDist = Math.hypot(rawDx, rawDy);
      if (rawDist > STICK_DEADZONE) {
        const effectiveDist = Math.min(rawDist, STICK_MAX_RADIUS) - STICK_DEADZONE;
        const normScale = effectiveDist / (STICK_MAX_RADIUS - STICK_DEADZONE);
        dx = (rawDx / rawDist) * normScale;
        dy = (rawDy / rawDist) * normScale;
      }
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

    // Souris desktop : clic gauche vise directement vers le curseur ou la cible pointée et tire
    if (ev.pointerType === 'mouse') {
      if (ev.button !== undefined && ev.button !== 0) return;
      const hitPos = this.findTargetAtScreenPos?.(x, y) ?? null;
      const targetWorldPos = hitPos ?? this.screenToWorldFn(x, y);
      const playerPos = this.getPlayerWorldFn();
      this.aimAngle = Math.atan2(targetWorldPos.y - playerPos.y, targetWorldPos.x - playerPos.x);
      this.mouseDownAiming = true;
      this.mouseAimDragged = false;
      this.mouseDownPos = { x, y };
      this.pendingFire = { angle: this.aimAngle, autoAim: false, targetWorldPos };
      return;
    }

    // Tactile (Mobile/Tablette) : Tap-to-Shoot direct si le doigt touche une cible
    const hitPos = this.findTargetAtScreenPos?.(x, y) ?? null;
    if (hitPos) {
      const playerPos = this.getPlayerWorldFn();
      this.aimAngle = Math.atan2(hitPos.y - playerPos.y, hitPos.x - playerPos.x);
      this.pendingFire = {
        angle: this.aimAngle,
        autoAim: true,
        targetWorldPos: hitPos,
      };
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
      this.rightStickMaxDist = 0;
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
      if (
        this.mouseDownAiming &&
        Math.hypot(x - this.mouseDownPos.x, y - this.mouseDownPos.y) >= AIM_ACTIVATION_DIST
      ) {
        this.mouseAimDragged = true;
      }
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
      const dist = Math.hypot(dx, dy);
      if (dist > this.rightStickMaxDist) {
        this.rightStickMaxDist = dist;
      }
      if (dist >= CANCEL_ZONE_RADIUS) {
        this.aimAngle = Math.atan2(dy / ISO_Y_SCALE, dx);
      }
    }
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    if (ev.pointerType === 'mouse') {
      if (this.mouseDownAiming) {
        if (ev.type !== 'pointercancel' && this.mouseAimDragged) {
          const rect = this.canvas.getBoundingClientRect();
          const x = ev.clientX - rect.left;
          const y = ev.clientY - rect.top;
          const hitPos = this.findTargetAtScreenPos?.(x, y) ?? null;
          const targetWorldPos = hitPos ?? this.screenToWorldFn(x, y);
          const playerPos = this.getPlayerWorldFn();
          this.aimAngle = Math.atan2(targetWorldPos.y - playerPos.y, targetWorldPos.x - playerPos.x);
          this.pendingFire = { angle: this.aimAngle, autoAim: false, targetWorldPos };
        }
        this.mouseDownAiming = false;
        this.mouseAimDragged = false;
      }
      return;
    }

    if (ev.pointerId === this.leftPointerId) {
      this.leftPointerId = null;
      this.leftStick.active = false;
    } else if (ev.pointerId === this.rightPointerId) {
      const dx = this.rightStick.currentX - this.rightStick.originX;
      const dy = this.rightStick.currentY - this.rightStick.originY;
      const currentDist = Math.hypot(dx, dy);
      const cancelling =
        this.rightStickMaxDist > AIM_ACTIVATION_DIST && currentDist < CANCEL_ZONE_RADIUS;

      if (!cancelling) {
        if (this.rightStickMaxDist <= CANCEL_ZONE_RADIUS) {
          this.pendingFire = { angle: this.aimAngle, autoAim: true };
        } else {
          if (currentDist >= CANCEL_ZONE_RADIUS) {
            this.aimAngle = Math.atan2(dy / ISO_Y_SCALE, dx);
          }
          this.pendingFire = { angle: this.aimAngle, autoAim: false };
        }
      }

      this.rightPointerId = null;
      this.rightStick.active = false;
      this.rightStickMaxDist = 0;
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
      this.pendingFire = { angle: this.aimAngle, autoAim: false };
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
