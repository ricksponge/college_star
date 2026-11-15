import type { CameraController } from '../engine/CameraController';

export const VICTORY_SLOW_MO_TIME_SCALE = 0.2;
export const VICTORY_SLOW_MO_DURATION_MS = 1500;
export const VICTORY_SLOW_MO_ZOOM = 1.32;

export interface IVictorySlowMoConfig {
  slowTimeScale?: number;
  durationMs?: number;
  targetZoom?: number;
}

export interface IVictorySlowMoTriggerParams {
  focusX: number;
  focusY: number;
  victory: boolean;
  label?: string;
  camera?: CameraController;
  onPodiumReady?: () => void;
}

export interface IVictorySlowMoState {
  active: boolean;
  finished: boolean;
  victory: boolean;
  timeScale: number;
  cameraZoom: number;
  focusX: number;
  focusY: number;
  progress: number;
  remainingMs: number;
  label: string;
}

/**
 * Contrôleur cinématique de coup final / victoire (Agent 14 - Cinématiques).
 * Ralentit le `timeScale` du moteur à 0.2x et zoome la caméra pendant 1,5s
 * sur l'action décisive avant de révéler l'écran de podium.
 */
export class VictorySlowMo {
  private readonly slowTimeScale: number;
  private readonly durationMs: number;
  private readonly targetZoom: number;

  private active = false;
  private finished = false;
  private victory = true;
  private elapsedMs = 0;
  private focusX = 0;
  private focusY = 0;
  private currentZoom = 1;
  private label = 'COUP FINAL !';
  private onPodiumReadyCallback: (() => void) | null = null;
  private podiumFired = false;

  constructor(config: IVictorySlowMoConfig = {}) {
    this.slowTimeScale = Math.max(0.05, Math.min(1, config.slowTimeScale ?? VICTORY_SLOW_MO_TIME_SCALE));
    this.durationMs = Math.max(300, config.durationMs ?? VICTORY_SLOW_MO_DURATION_MS);
    this.targetZoom = Math.max(1.05, Math.min(2, config.targetZoom ?? VICTORY_SLOW_MO_ZOOM));
  }

  public triggerFinalBlow(params: IVictorySlowMoTriggerParams): void {
    this.active = true;
    this.finished = false;
    this.victory = params.victory;
    this.elapsedMs = 0;
    this.focusX = params.focusX;
    this.focusY = params.focusY;
    this.currentZoom = 1;
    this.label = params.label ?? (params.victory ? 'VICTOIRE ÉCLATANTE !' : 'FIN DU TEMPS !');
    this.onPodiumReadyCallback = params.onPodiumReady ?? null;
    this.podiumFired = false;

    if (params.camera) {
      params.camera.triggerSuperZoom(Math.min(1.24, this.targetZoom), this.durationMs);
      params.camera.screenShake(params.victory ? 14 : 9, 320);
    }
  }

  /**
   * Met à jour le ralenti cinématique avec le delta réel non-scalé (en ms).
   */
  public update(realDeltaMs: number): IVictorySlowMoState {
    if (!this.active) {
      return this.getState();
    }

    const safeDelta = Math.max(0, realDeltaMs);
    this.elapsedMs = Math.min(this.durationMs, this.elapsedMs + safeDelta);
    const progress = this.elapsedMs / this.durationMs;

    // Ease-out cubique fluide sur le zoom caméra pendant la fenêtre de 1,5s
    const easedZoomProgress = 1 - Math.pow(1 - progress, 3);
    this.currentZoom = Number((1 + (this.targetZoom - 1) * easedZoomProgress).toFixed(3));

    if (this.elapsedMs >= this.durationMs) {
      this.active = false;
      this.finished = true;
      if (!this.podiumFired) {
        this.podiumFired = true;
        this.onPodiumReadyCallback?.();
      }
    }

    return this.getState();
  }

  /**
   * Retourne le multiplicateur temporel courant (`0.2` pendant le slow-mo, `1.0` sinon).
   */
  public getTimeScale(): number {
    return this.active ? this.slowTimeScale : 1;
  }

  public getState(): IVictorySlowMoState {
    const progress = this.durationMs > 0 ? Math.min(1, this.elapsedMs / this.durationMs) : 1;
    return {
      active: this.active,
      finished: this.finished,
      victory: this.victory,
      timeScale: this.getTimeScale(),
      cameraZoom: this.active ? this.currentZoom : 1,
      focusX: this.focusX,
      focusY: this.focusY,
      progress: Number(progress.toFixed(3)),
      remainingMs: Math.max(0, Math.round(this.durationMs - this.elapsedMs)),
      label: this.label,
    };
  }

  public reset(): void {
    this.active = false;
    this.finished = false;
    this.elapsedMs = 0;
    this.currentZoom = 1;
    this.onPodiumReadyCallback = null;
    this.podiumFired = false;
  }
}
