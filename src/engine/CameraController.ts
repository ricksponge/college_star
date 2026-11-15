/**
 * Contrôleur de caméra 2.5D :
 * - Suivi amorti (lerp indépendant du framerate) du héros
 * - Légère impulsion de zoom lors du déclenchement du Super
 * - screenShake(intensity, durationMs) fluide à haute fréquence sur chaque impact
 */

export interface ICameraFrameState {
  x: number;
  y: number;
  effectiveX: number;
  effectiveY: number;
  zoom: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
}

export class CameraController {
  private x = 0;
  private y = 0;
  private initialized = false;

  private zoom = 1;
  private targetZoom = 1;
  private superZoomTimerMs = 0;

  private shakeIntensity = 0;
  private shakeRemainingMs = 0;
  private shakeDurationMs = 1;
  private shakePhase = 0;

  private readonly followStiffness: number;

  constructor(followStiffness = 8.5) {
    this.followStiffness = followStiffness;
  }

  public reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.initialized = true;
    this.zoom = 1;
    this.targetZoom = 1;
    this.superZoomTimerMs = 0;
    this.shakeIntensity = 0;
    this.shakeRemainingMs = 0;
  }

  public triggerSuperZoom(peakScale = 1.11, durationMs = 560): void {
    this.targetZoom = Math.max(1.02, Math.min(1.24, peakScale));
    this.superZoomTimerMs = Math.max(durationMs, 120);
  }

  public screenShake(intensity: number, durationMs = 220): void {
    if (intensity <= 0) return;
    if (intensity >= this.shakeIntensity || this.shakeRemainingMs <= 0) {
      this.shakeIntensity = Math.min(28, intensity);
    } else {
      this.shakeIntensity = Math.min(28, Math.max(this.shakeIntensity, intensity * 0.85));
    }
    this.shakeDurationMs = Math.max(80, durationMs);
    this.shakeRemainingMs = Math.max(this.shakeRemainingMs, this.shakeDurationMs);
  }

  public update(targetX: number, targetY: number, dtSec: number): ICameraFrameState {
    if (!this.initialized) {
      this.x = targetX;
      this.y = targetY;
      this.initialized = true;
    } else {
      const alpha = 1 - Math.exp(-this.followStiffness * Math.min(0.1, dtSec));
      this.x += (targetX - this.x) * alpha;
      this.y += (targetY - this.y) * alpha;
    }

    const dtMs = dtSec * 1000;
    if (this.superZoomTimerMs > 0) {
      this.superZoomTimerMs = Math.max(0, this.superZoomTimerMs - dtMs);
      if (this.superZoomTimerMs <= 0) {
        this.targetZoom = 1;
      }
    }

    const zoomLerp = 1 - Math.exp(-7.2 * Math.min(0.1, dtSec));
    this.zoom += (this.targetZoom - this.zoom) * zoomLerp;
    if (Math.abs(this.zoom - 1) < 0.001 && this.targetZoom === 1) {
      this.zoom = 1;
    }

    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    if (this.shakeRemainingMs > 0) {
      this.shakeRemainingMs = Math.max(0, this.shakeRemainingMs - dtMs);
      this.shakePhase += dtSec * 58;
      const ratio = this.shakeRemainingMs / Math.max(1, this.shakeDurationMs);
      const amp = this.shakeIntensity * ratio;
      shakeOffsetX = Math.sin(this.shakePhase * 1.13) * amp + (Math.random() - 0.5) * amp * 0.45;
      shakeOffsetY = Math.cos(this.shakePhase * 1.47) * amp * 0.8 + (Math.random() - 0.5) * amp * 0.45;
      if (this.shakeRemainingMs <= 0) {
        this.shakeIntensity = 0;
      }
    }

    return {
      x: this.x,
      y: this.y,
      effectiveX: this.x + shakeOffsetX,
      effectiveY: this.y + shakeOffsetY,
      zoom: this.zoom,
      shakeOffsetX,
      shakeOffsetY,
    };
  }
}
