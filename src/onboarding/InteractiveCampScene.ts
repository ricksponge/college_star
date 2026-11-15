import type { BrawlerId, IBrawler } from '../types/cctp';
import {
  ERROR_PENALTY_COOLDOWN_MS,
  ERROR_SHIELD_DURATION_MS,
} from '../engine/CombatMath';
import { ISO_Y_SCALE, type IRenderVec2 } from '../engine/IsometricRenderer';
import { TwinStickController } from '../engine/TwinStickController';
import { getBrawlerById } from '../entities/Brawlers';
import { soundManager } from '../services/SoundManager';

export type CampTutorialStep =
  | 'STEP_1_MOVE'
  | 'STEP_2_AIM_QCM'
  | 'STEP_3_PENALTY_RULE'
  | 'STEP_4_SUPER_DIPLOMA'
  | 'COMPLETED';

export interface ICampCompletionSummary {
  brawlerId: BrawlerId;
  completedSteps: number;
  durationSeconds: number;
  diplomaTitle: string;
}

export interface IInteractiveCampOptions {
  brawlerId?: BrawlerId;
  playerNickname?: string;
  hostElement?: HTMLElement;
  onStepChange?: (step: CampTutorialStep) => void;
  onComplete?: (summary: ICampCompletionSummary) => void;
}

interface ICampTarget {
  id: string;
  x: number;
  y: number;
  vx: number;
  label: string;
  isCorrect: boolean;
  hp: number;
  maxHp: number;
  radius: number;
  shieldRemainingMs: number;
  hitFlashMs: number;
}

interface ICampProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  distanceTraveled: number;
  maxRange: number;
  isDemoBadShot?: boolean;
  isSuperBolt?: boolean;
}

interface ICampParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  maxLifeMs: number;
  size: number;
  color: string;
}

interface ICampFloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  lifeMs: number;
  maxLifeMs: number;
}

const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 560;
const PLAYER_RADIUS = 22;

const BRAWLER_ACCENTS: Record<BrawlerId, { primary: string; secondary: string; badge: string }> = {
  TIMO: { primary: '#ffd426', secondary: '#2563eb', badge: '⚽' },
  LEO: { primary: '#c084fc', secondary: '#312e81', badge: '📘' },
  MAYA: { primary: '#4ade80', secondary: '#15803d', badge: '🧭' },
  ZACK: { primary: '#22d3ee', secondary: '#db2777', badge: '🎧' },
};

function playSafeUiSound(): void {
  const maybeExtended = soundManager as unknown as { playUiClick?: () => void };
  if (typeof maybeExtended.playUiClick === 'function') {
    maybeExtended.playUiClick();
  } else {
    soundManager.playGadget();
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureCampStylesInjected(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ftue-camp-styles')) return;

  const style = document.createElement('style');
  style.id = 'ftue-camp-styles';
  style.textContent = `
    .ftue-camp-root {
      position: fixed;
      inset: 0;
      z-index: 10040;
      background: #080d22;
      overflow: hidden;
      user-select: none;
      touch-action: none;
      font-family: var(--brawl-font-ui, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif);
    }

    .ftue-camp-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    .ftue-camp-spotlight-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 6;
      transition: opacity 0.25s ease;
    }

    .ftue-camp-spotlight-hole {
      position: absolute;
      border-radius: 999px;
      box-shadow: 0 0 0 9999px rgba(4, 7, 20, 0.72), 0 0 28px 6px rgba(250, 204, 21, 0.85);
      border: 3.5px solid #ffd426;
      transition: left 0.28s ease, top 0.28s ease, width 0.28s ease, height 0.28s ease, border-radius 0.28s ease;
      animation: ftue-spot-pulse 1.3s ease-in-out infinite;
    }

    @keyframes ftue-spot-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.04); }
    }

    .ftue-camp-hud-layer {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: none;
    }

    .ftue-camp-topbar {
      position: absolute;
      top: 12px;
      left: 14px;
      right: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }

    .ftue-camp-step-pills {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(11, 17, 41, 0.88);
      border: 3px solid #090d16;
      border-radius: 14px;
      padding: 6px 10px;
      box-shadow: 0 4px 0 #090d16;
      pointer-events: auto;
    }

    .ftue-camp-step-dot {
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 900;
      color: #94a3b8;
      background: #1e293b;
      border: 2px solid #090d16;
    }

    .ftue-camp-step-dot.is-active {
      background: linear-gradient(180deg, #ffd426, #f59e0b);
      color: #090d16;
      box-shadow: 0 0 12px rgba(255, 212, 38, 0.7);
    }

    .ftue-camp-step-dot.is-done {
      background: #16a34a;
      color: #ffffff;
    }

    .ftue-camp-qcm-banner {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      min-width: min(390px, 86vw);
      max-width: 90vw;
      padding: 10px 22px;
      border-radius: 16px;
      border: 3.5px solid #090d16;
      background: linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%);
      box-shadow: 0 6px 0 #090d16, 0 10px 24px rgba(0, 0, 0, 0.5);
      text-align: center;
      color: #ffffff;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .ftue-camp-qcm-banner.is-hidden {
      opacity: 0;
      pointer-events: none;
      transform: translateX(-50%) translateY(-20px) scale(0.92);
    }

    .ftue-camp-coach-bubble {
      position: absolute;
      left: 50%;
      bottom: 20px;
      transform: translateX(-50%);
      width: min(560px, 90vw);
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 16px;
      border-radius: 18px;
      border: 3.5px solid #090d16;
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      box-shadow: 0 7px 0 #090d16, 0 14px 30px rgba(0, 0, 0, 0.6);
      color: #f8fafc;
      pointer-events: auto;
    }

    .ftue-camp-coach-avatar {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      border: 3px solid #ffd426;
      background: linear-gradient(180deg, #2563eb, #1e3a8a);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      flex-shrink: 0;
    }

    .ftue-camp-stick-badge {
      position: absolute;
      bottom: 34px;
      width: 118px;
      height: 118px;
      border-radius: 999px;
      border: 3px dashed rgba(56, 189, 248, 0.85);
      background: rgba(15, 23, 42, 0.42);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #e0f2fe;
      font-size: 11px;
      font-weight: 900;
      text-align: center;
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .ftue-camp-stick-badge.is-left {
      left: 34px;
    }

    .ftue-camp-stick-badge.is-right {
      right: 146px;
      border-color: rgba(250, 204, 21, 0.85);
      color: #fef08a;
    }

    .ftue-camp-stick-badge.is-hidden {
      opacity: 0;
      transform: scale(0.8);
    }

    .ftue-camp-super-wrap {
      position: absolute;
      right: 26px;
      bottom: 34px;
      pointer-events: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .ftue-camp-super-wrap.is-hidden {
      opacity: 0;
      pointer-events: none;
      transform: scale(0.75);
    }

    .ftue-camp-super-btn {
      width: 96px;
      height: 96px;
      border-radius: 999px;
      border: 4px solid #090d16;
      background: linear-gradient(180deg, #fef08a 0%, #ffd426 42%, #f59e0b 100%);
      color: #090d16;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 14px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 7px 0 #090d16, 0 0 28px rgba(255, 212, 38, 0.9);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      transition: transform 0.1s ease, filter 0.15s ease;
    }

    .ftue-camp-super-btn:disabled {
      background: linear-gradient(180deg, #475569, #1e293b);
      color: #94a3b8;
      box-shadow: 0 5px 0 #090d16;
      cursor: not-allowed;
    }

    .ftue-camp-super-btn:not(:disabled):active {
      transform: translateY(4px);
      box-shadow: 0 3px 0 #090d16, 0 0 32px rgba(255, 212, 38, 1);
    }

    .ftue-camp-penalty-pill {
      position: absolute;
      top: 86px;
      left: 50%;
      transform: translateX(-50%);
      padding: 8px 16px;
      border-radius: 14px;
      border: 3px solid #090d16;
      background: linear-gradient(180deg, #dc2626 0%, #991b1b 100%);
      color: #fef2f2;
      font-size: 13px;
      font-weight: 900;
      box-shadow: 0 5px 0 #090d16;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: opacity 0.2s ease;
    }

    .ftue-camp-penalty-pill.is-hidden {
      opacity: 0;
      pointer-events: none;
    }

    .ftue-camp-diploma-overlay {
      position: absolute;
      inset: 0;
      z-index: 30;
      background: rgba(4, 8, 22, 0.86);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .ftue-camp-diploma-card {
      width: min(520px, 94vw);
      background: linear-gradient(180deg, #1e3a8a 0%, #0f172a 100%);
      border: 4px solid #ffd426;
      border-radius: 26px;
      padding: 26px 24px;
      text-align: center;
      color: #ffffff;
      box-shadow: 0 12px 0 #090d16, 0 0 55px rgba(255, 212, 38, 0.45);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Camp d'entraînement interactif guidé en 4 étapes (Issue #26 [FTUE-CAMP]) :
 * - Étape 1 : Stick gauche seul visible + Zone bleue à atteindre.
 * - Étape 2 : Bandeau QCM + Bulle Coach + Stick droit débloqué pour viser la bonne réponse.
 * - Étape 3 : Simulation & démonstration visuelle de la pénalité (tir bloqué 1,5s + bouclier cible 3s).
 * - Étape 4 : Jauge Super à 100 % avec Spotlight sur le bouton doré pour décrocher le diplôme d'entrée.
 */
export class InteractiveCampScene {
  private readonly options: IInteractiveCampOptions;
  private readonly brawler: IBrawler;
  private readonly playerNickname: string;

  private rootEl: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private controller: TwinStickController | null = null;

  private step: CampTutorialStep = 'STEP_1_MOVE';
  private stepElapsedMs = 0;
  private totalElapsedMs = 0;
  private rafId: number | null = null;
  private lastTickMs = 0;
  private running = false;

  // État joueur
  private playerX = 210;
  private playerY = 390;
  private aimAngle = -Math.PI / 4;
  private shootCooldownMs = 0;
  private penaltyLockRemainingMs = 0;
  private superGaugePct = 0;

  // Zone bleue étape 1
  private readonly blueZone = { x: 690, y: 215, radius: 66 };
  private step1ZoneReached = false;

  // Étape 3 : simulation règle de pénalité
  private step3DemoShotFired = false;
  private step3DemoHitDone = false;

  // Entités d'arène
  private targets: ICampTarget[] = [];
  private projectiles: ICampProjectile[] = [];
  private particles: ICampParticle[] = [];
  private floatingTexts: ICampFloatingText[] = [];
  private stepTransitionTimerMs = 0;
  private pendingNextStep: CampTutorialStep | null = null;

  // Références DOM HUD
  private qcmBannerEl: HTMLElement | null = null;
  private qcmPromptEl: HTMLElement | null = null;
  private coachTitleEl: HTMLElement | null = null;
  private coachTextEl: HTMLElement | null = null;
  private leftStickBadgeEl: HTMLElement | null = null;
  private rightStickBadgeEl: HTMLElement | null = null;
  private superWrapEl: HTMLElement | null = null;
  private superBtnEl: HTMLButtonElement | null = null;
  private superPctEl: HTMLElement | null = null;
  private penaltyPillEl: HTMLElement | null = null;
  private spotlightHoleEl: HTMLElement | null = null;
  private spotlightLayerEl: HTMLElement | null = null;
  private stepDots: HTMLElement[] = [];

  constructor(options: IInteractiveCampOptions = {}) {
    this.options = options;
    this.brawler = getBrawlerById(options.brawlerId ?? 'TIMO');
    this.playerNickname = options.playerNickname?.trim() || this.brawler.name;
  }

  public getCurrentStep(): CampTutorialStep {
    return this.step;
  }

  public getSuperGaugePct(): number {
    return this.superGaugePct;
  }

  public start(hostOverride?: HTMLElement): void {
    this.stop();
    ensureCampStylesInjected();

    const host = hostOverride ?? this.options.hostElement ?? document.body;
    const root = document.createElement('div');
    root.id = 'ftue-interactive-camp';
    root.className = 'ftue-camp-root';

    root.innerHTML = `
      <canvas id="ftue-camp-canvas" class="ftue-camp-canvas"></canvas>

      <div id="ftue-camp-spotlight-layer" class="ftue-camp-spotlight-layer" style="opacity:0;">
        <div id="ftue-camp-spotlight-hole" class="ftue-camp-spotlight-hole"></div>
      </div>

      <div class="ftue-camp-hud-layer">
        <div class="ftue-camp-topbar">
          <div class="ftue-camp-step-pills">
            <span data-camp-step="1" class="ftue-camp-step-dot is-active">1. Bouger</span>
            <span data-camp-step="2" class="ftue-camp-step-dot">2. Tir QCM</span>
            <span data-camp-step="3" class="ftue-camp-step-dot">3. Bouclier 1,5s</span>
            <span data-camp-step="4" class="ftue-camp-step-dot">4. Super !</span>
          </div>
          <div style="background:rgba(11,17,41,0.88); border:3px solid #090d16; border-radius:14px; padding:6px 12px; font-size:12px; font-weight:900; color:#fef08a; box-shadow:0 4px 0 #090d16;">
            🎓 Camp de Rentrée • ${escapeHtml(this.playerNickname)} (${escapeHtml(this.brawler.name)})
          </div>
        </div>

        <div id="ftue-camp-qcm-banner" class="ftue-camp-qcm-banner is-hidden">
          <div style="font-size:10px; font-weight:900; letter-spacing:1px; color:#93c5fd;">QUESTION FLASH</div>
          <div id="ftue-camp-qcm-prompt" class="brawl-title" style="font-size:22px; color:#ffd426; margin-top:2px;">
            6 × 7 = ?
          </div>
        </div>

        <div id="ftue-camp-penalty-pill" class="ftue-camp-penalty-pill is-hidden"></div>

        <div id="ftue-camp-left-badge" class="ftue-camp-stick-badge is-left">
          <span style="font-size:26px;">🕹️</span>
          <span>STICK GAUCHE</span>
          <span style="font-size:9.5px; color:#93c5fd;">Glisse ou ZQSD</span>
        </div>

        <div id="ftue-camp-right-badge" class="ftue-camp-stick-badge is-right is-hidden">
          <span style="font-size:26px;">🎯</span>
          <span>STICK DROIT</span>
          <span style="font-size:9.5px; color:#fde047;">Vise ou clique</span>
        </div>

        <div id="ftue-camp-super-wrap" class="ftue-camp-super-wrap is-hidden">
          <div id="ftue-camp-super-pct" class="brawl-outline-text" style="font-size:13px; color:#ffd426;">
            SUPER 100%
          </div>
          <button id="ftue-camp-super-btn" type="button" class="ftue-camp-super-btn brawl-pulse">
            <span style="font-size:28px; line-height:1;">⚡</span>
            <span>SUPER</span>
          </button>
        </div>

        <div class="ftue-camp-coach-bubble">
          <div class="ftue-camp-coach-avatar">🏅</div>
          <div style="flex:1; min-width:0;">
            <div id="ftue-camp-coach-title" style="font-size:11px; font-weight:900; color:#ffd426; letter-spacing:0.6px; text-transform:uppercase;">
              COACH DU COLLÈGE • ÉTAPE 1/4
            </div>
            <div id="ftue-camp-coach-text" style="font-size:13.5px; font-weight:800; color:#f8fafc; line-height:1.35; margin-top:2px;">
              Déplace ton héros jusqu'à la zone bleue !
            </div>
          </div>
        </div>
      </div>
    `;

    host.appendChild(root);
    this.rootEl = root;

    const canvas = root.querySelector<HTMLCanvasElement>('#ftue-camp-canvas');
    if (!canvas) {
      throw new Error('Impossible d’initialiser le canvas du Camp d’entraînement.');
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexte 2D indisponible pour InteractiveCampScene.');
    }
    this.canvas = canvas;
    this.ctx = ctx;

    this.qcmBannerEl = root.querySelector('#ftue-camp-qcm-banner');
    this.qcmPromptEl = root.querySelector('#ftue-camp-qcm-prompt');
    this.coachTitleEl = root.querySelector('#ftue-camp-coach-title');
    this.coachTextEl = root.querySelector('#ftue-camp-coach-text');
    this.leftStickBadgeEl = root.querySelector('#ftue-camp-left-badge');
    this.rightStickBadgeEl = root.querySelector('#ftue-camp-right-badge');
    this.superWrapEl = root.querySelector('#ftue-camp-super-wrap');
    this.superBtnEl = root.querySelector<HTMLButtonElement>('#ftue-camp-super-btn');
    this.superPctEl = root.querySelector('#ftue-camp-super-pct');
    this.penaltyPillEl = root.querySelector('#ftue-camp-penalty-pill');
    this.spotlightLayerEl = root.querySelector('#ftue-camp-spotlight-layer');
    this.spotlightHoleEl = root.querySelector('#ftue-camp-spotlight-hole');
    this.stepDots = Array.from(root.querySelectorAll<HTMLElement>('[data-camp-step]'));

    this.resizeCanvas();
    window.addEventListener('resize', this.onWindowResize);

    this.controller = new TwinStickController(
      canvas,
      (sx, sy) => this.screenToWorld(sx, sy),
      () => ({ x: this.playerX, y: this.playerY }),
      (sx, sy) => this.findTargetAtScreenPos(sx, sy)
    );
    this.controller.attach();

    this.superBtnEl?.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      this.handleSuperTrigger();
    });
    this.superBtnEl?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.handleSuperTrigger();
    });

    this.enterStep('STEP_1_MOVE');
    this.running = true;
    this.lastTickMs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('resize', this.onWindowResize);
    this.controller?.detach();
    this.controller = null;
    this.rootEl?.remove();
    this.rootEl = null;
    this.canvas = null;
    this.ctx = null;
  }

  private readonly onWindowResize = (): void => {
    this.resizeCanvas();
    this.updateSpotlightGeometry();
    requestAnimationFrame(() => this.updateSpotlightGeometry());
  };

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(240, this.canvas.clientHeight || window.innerHeight);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  private getCanvasTransform(): { scale: number; offsetX: number; offsetY: number; cssW: number; cssH: number } {
    const cssW = this.canvas?.clientWidth || window.innerWidth || ARENA_WIDTH;
    const cssH = this.canvas?.clientHeight || window.innerHeight || ARENA_HEIGHT;
    const projectedH = ARENA_HEIGHT * ISO_Y_SCALE;
    const scale = Math.min(cssW / (ARENA_WIDTH + 60), cssH / (projectedH + 170));
    const offsetX = (cssW - ARENA_WIDTH * scale) * 0.5;
    const offsetY = (cssH - projectedH * scale) * 0.48;
    return { scale, offsetX, offsetY, cssW, cssH };
  }

  private worldToScreen(wx: number, wy: number): IRenderVec2 {
    const { scale, offsetX, offsetY } = this.getCanvasTransform();
    return {
      x: offsetX + wx * scale,
      y: offsetY + wy * ISO_Y_SCALE * scale,
    };
  }

  private screenToWorld(sx: number, sy: number): IRenderVec2 {
    const { scale, offsetX, offsetY } = this.getCanvasTransform();
    return {
      x: (sx - offsetX) / Math.max(0.01, scale),
      y: (sy - offsetY) / Math.max(0.01, scale * ISO_Y_SCALE),
    };
  }

  private findTargetAtScreenPos(sx: number, sy: number): IRenderVec2 | null {
    const world = this.screenToWorld(sx, sy);
    let best: ICampTarget | null = null;
    let bestDist = Infinity;
    for (const t of this.targets) {
      if (t.hp <= 0) continue;
      const dist = Math.hypot(world.x - t.x, world.y - t.y);
      if (dist <= t.radius + 32 && dist < bestDist) {
        best = t;
        bestDist = dist;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  private enterStep(nextStep: CampTutorialStep): void {
    this.step = nextStep;
    this.stepElapsedMs = 0;
    this.pendingNextStep = null;
    this.stepTransitionTimerMs = 0;
    this.projectiles = [];
    this.penaltyLockRemainingMs = 0;
    this.options.onStepChange?.(nextStep);

    const stepNumMap: Record<CampTutorialStep, number> = {
      STEP_1_MOVE: 1,
      STEP_2_AIM_QCM: 2,
      STEP_3_PENALTY_RULE: 3,
      STEP_4_SUPER_DIPLOMA: 4,
      COMPLETED: 5,
    };
    const activeNum = stepNumMap[nextStep];
    this.stepDots.forEach((dot) => {
      const n = Number(dot.dataset.campStep);
      dot.classList.toggle('is-active', n === activeNum);
      dot.classList.toggle('is-done', n < activeNum);
    });

    switch (nextStep) {
      case 'STEP_1_MOVE': {
        this.playerX = 210;
        this.playerY = 390;
        this.step1ZoneReached = false;
        this.targets = [];
        this.superGaugePct = 0;

        // Masque tout le HUD sauf le stick gauche
        this.qcmBannerEl?.classList.add('is-hidden');
        this.rightStickBadgeEl?.classList.add('is-hidden');
        this.superWrapEl?.classList.add('is-hidden');
        this.penaltyPillEl?.classList.add('is-hidden');
        this.leftStickBadgeEl?.classList.remove('is-hidden');

        if (this.coachTitleEl) this.coachTitleEl.textContent = 'COACH • ÉTAPE 1 / 4 : DÉPLACEMENT';
        if (this.coachTextEl) {
          this.coachTextEl.textContent =
            "Déplace ton héros jusqu'à la zone bleue en utilisant le stick gauche (ou ZQSD / Flèches).";
        }
        break;
      }

      case 'STEP_2_AIM_QCM': {
        this.qcmBannerEl?.classList.remove('is-hidden');
        this.leftStickBadgeEl?.classList.remove('is-hidden');
        this.rightStickBadgeEl?.classList.remove('is-hidden');
        this.superWrapEl?.classList.add('is-hidden');
        this.penaltyPillEl?.classList.add('is-hidden');

        if (this.qcmPromptEl) this.qcmPromptEl.textContent = '6 × 7 = ?';
        if (this.coachTitleEl) this.coachTitleEl.textContent = 'COACH • ÉTAPE 2 / 4 : VISÉE QCM';
        if (this.coachTextEl) {
          this.coachTextEl.textContent =
            'Repère la bonne réponse sur le drone et vise-le avec le stick droit !';
        }

        this.targets = [
          {
            id: 'step2_wrong_a',
            x: 310,
            y: 165,
            vx: 26,
            label: '36',
            isCorrect: false,
            hp: 1000,
            maxHp: 1000,
            radius: 30,
            shieldRemainingMs: 0,
            hitFlashMs: 0,
          },
          {
            id: 'step2_correct',
            x: 495,
            y: 135,
            vx: -24,
            label: '42',
            isCorrect: true,
            hp: 900,
            maxHp: 900,
            radius: 32,
            shieldRemainingMs: 0,
            hitFlashMs: 0,
          },
          {
            id: 'step2_wrong_b',
            x: 700,
            y: 175,
            vx: 22,
            label: '48',
            isCorrect: false,
            hp: 1000,
            maxHp: 1000,
            radius: 30,
            shieldRemainingMs: 0,
            hitFlashMs: 0,
          },
        ];
        break;
      }

      case 'STEP_3_PENALTY_RULE': {
        this.qcmBannerEl?.classList.remove('is-hidden');
        this.leftStickBadgeEl?.classList.remove('is-hidden');
        this.rightStickBadgeEl?.classList.remove('is-hidden');
        this.superWrapEl?.classList.add('is-hidden');
        this.step3DemoShotFired = false;
        this.step3DemoHitDone = false;

        if (this.qcmPromptEl) this.qcmPromptEl.textContent = 'Capitale de la France ?';
        if (this.coachTitleEl) this.coachTitleEl.textContent = 'COACH • ÉTAPE 3 / 4 : RÈGLE DU BOUCLIER';
        if (this.coachTextEl) {
          this.coachTextEl.textContent =
            'Si tu touches une mauvaise réponse, ton tir se bloque 1,5s et la cible devient invincible 3s : prends le temps de lire la question !';
        }

        this.targets = [
          {
            id: 'step3_wrong_lyon',
            x: 360,
            y: 160,
            vx: 0,
            label: 'Lyon',
            isCorrect: false,
            hp: 1000,
            maxHp: 1000,
            radius: 32,
            shieldRemainingMs: 0,
            hitFlashMs: 0,
          },
          {
            id: 'step3_correct_paris',
            x: 630,
            y: 160,
            vx: 0,
            label: 'Paris',
            isCorrect: true,
            hp: 900,
            maxHp: 900,
            radius: 32,
            shieldRemainingMs: 0,
            hitFlashMs: 0,
          },
        ];
        break;
      }

      case 'STEP_4_SUPER_DIPLOMA': {
        this.superGaugePct = 100;
        soundManager.playSuperReady();

        this.qcmBannerEl?.classList.remove('is-hidden');
        this.penaltyPillEl?.classList.add('is-hidden');
        this.superWrapEl?.classList.remove('is-hidden');
        if (this.superBtnEl) this.superBtnEl.disabled = false;
        if (this.superPctEl) this.superPctEl.textContent = `SUPER ${this.superGaugePct}% ⚡`;

        if (this.qcmPromptEl) this.qcmPromptEl.textContent = 'EXAMEN FINAL : 9 × 8 = ?';
        if (this.coachTitleEl) this.coachTitleEl.textContent = 'COACH • ÉTAPE 4 / 4 : ATTAQUE SUPER';
        if (this.coachTextEl) {
          this.coachTextEl.textContent =
            'Ton Super est prêt ! Appuie sur le bouton doré (ou Barre Espace) pour gagner ton diplôme d’entrée !';
        }

        this.targets = [
          {
            id: 'step4_boss_drone',
            x: 495,
            y: 155,
            vx: 18,
            label: '72 ★',
            isCorrect: true,
            hp: 2400,
            maxHp: 2400,
            radius: 40,
            shieldRemainingMs: 0,
            hitFlashMs: 0,
          },
        ];
        break;
      }

      case 'COMPLETED': {
        this.spotlightLayerEl?.style.setProperty('opacity', '0');
        this.showDiplomaModal();
        break;
      }
    }

    this.updateSpotlightGeometry();
    requestAnimationFrame(() => this.updateSpotlightGeometry());
  }

  private updateSpotlightGeometry(): void {
    if (!this.spotlightLayerEl || !this.spotlightHoleEl) return;

    if (this.step === 'STEP_1_MOVE' && this.leftStickBadgeEl) {
      const r = this.leftStickBadgeEl.getBoundingClientRect();
      this.spotlightLayerEl.style.opacity = '1';
      this.spotlightHoleEl.style.left = `${r.left - 12}px`;
      this.spotlightHoleEl.style.top = `${r.top - 12}px`;
      this.spotlightHoleEl.style.width = `${r.width + 24}px`;
      this.spotlightHoleEl.style.height = `${r.height + 24}px`;
      this.spotlightHoleEl.style.borderRadius = '999px';
      return;
    }

    if (this.step === 'STEP_4_SUPER_DIPLOMA' && this.superBtnEl) {
      const r = this.superBtnEl.getBoundingClientRect();
      this.spotlightLayerEl.style.opacity = '1';
      this.spotlightHoleEl.style.left = `${r.left - 16}px`;
      this.spotlightHoleEl.style.top = `${r.top - 16}px`;
      this.spotlightHoleEl.style.width = `${r.width + 32}px`;
      this.spotlightHoleEl.style.height = `${r.height + 32}px`;
      this.spotlightHoleEl.style.borderRadius = '999px';
      return;
    }

    this.spotlightLayerEl.style.opacity = '0';
  }

  private readonly loop = (nowMs: number): void => {
    if (!this.running) return;
    const dtMs = Math.min(50, Math.max(4, nowMs - this.lastTickMs));
    this.lastTickMs = nowMs;

    this.update(dtMs);
    this.render();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dtMs: number): void {
    this.stepElapsedMs += dtMs;
    this.totalElapsedMs += dtMs;

    if (this.stepTransitionTimerMs > 0) {
      this.stepTransitionTimerMs -= dtMs;
      if (this.stepTransitionTimerMs <= 0 && this.pendingNextStep) {
        const next = this.pendingNextStep;
        this.pendingNextStep = null;
        this.enterStep(next);
        return;
      }
    }

    this.shootCooldownMs = Math.max(0, this.shootCooldownMs - dtMs);
    this.penaltyLockRemainingMs = Math.max(0, this.penaltyLockRemainingMs - dtMs);

    // Mise à jour déplacement joueur (toujours actif hors écran diplôme)
    if (this.controller && this.step !== 'COMPLETED') {
      const moveVec = this.controller.getMoveVector();
      const speedPxPerSec = this.brawler.speed_value * 0.44;
      this.playerX = Math.max(
        70,
        Math.min(ARENA_WIDTH - 70, this.playerX + moveVec.x * speedPxPerSec * (dtMs / 1000))
      );
      this.playerY = Math.max(
        110,
        Math.min(ARENA_HEIGHT - 65, this.playerY + moveVec.y * speedPxPerSec * (dtMs / 1000))
      );
      this.aimAngle = this.controller.getAimAngle();

      // Vérifier l'entrée dans la zone bleue (Étape 1)
      if (this.step === 'STEP_1_MOVE' && !this.step1ZoneReached) {
        const distToZone = Math.hypot(this.playerX - this.blueZone.x, this.playerY - this.blueZone.y);
        if (distToZone <= this.blueZone.radius - 4) {
          this.step1ZoneReached = true;
          soundManager.playHitCorrect(1.1);
          this.spawnParticles(this.blueZone.x, this.blueZone.y, '#38bdf8', 22);
          this.spawnFloatingText(this.blueZone.x, this.blueZone.y - 36, '✅ ZONE BLEUE ATTEINTE !', '#4ade80');
          this.scheduleTransition('STEP_2_AIM_QCM', 700);
        }
      }

      // Étape 3 : Simulation automatique de l'impact sur mauvaise réponse à 550ms
      if (this.step === 'STEP_3_PENALTY_RULE' && !this.step3DemoShotFired && this.stepElapsedMs >= 550) {
        this.step3DemoShotFired = true;
        const wrongDrone = this.targets.find((t) => t.id === 'step3_wrong_lyon');
        if (wrongDrone) {
          const ang = Math.atan2(wrongDrone.y - this.playerY, wrongDrone.x - this.playerX);
          this.projectiles.push({
            x: this.playerX,
            y: this.playerY,
            vx: Math.cos(ang) * 560,
            vy: Math.sin(ang) * 560,
            radius: 11,
            color: '#fb7185',
            distanceTraveled: 0,
            maxRange: 1400,
            isDemoBadShot: true,
          });
        }
      }

      // Commandes de tir (débloquées à partir de l'étape 2)
      const fireCmd = this.controller.consumeFireCommand();
      const canShoot =
        (this.step === 'STEP_2_AIM_QCM' ||
          (this.step === 'STEP_3_PENALTY_RULE' && this.step3DemoHitDone)) &&
        this.shootCooldownMs <= 0 &&
        this.penaltyLockRemainingMs <= 0 &&
        !this.pendingNextStep;

      if (fireCmd && canShoot) {
        this.firePlayerProjectile(fireCmd.angle);
      }

      // Commande Super (Étape 4)
      if (this.controller.consumeSuperCommand() && this.step === 'STEP_4_SUPER_DIPLOMA') {
        this.handleSuperTrigger();
      }
    }

    // Déplacement des drones cibles et décompte boucliers
    for (const t of this.targets) {
      t.hitFlashMs = Math.max(0, t.hitFlashMs - dtMs);
      t.shieldRemainingMs = Math.max(0, t.shieldRemainingMs - dtMs);
      if (t.hp > 0 && t.vx !== 0) {
        t.x += t.vx * (dtMs / 1000);
        if (t.x < 160 || t.x > ARENA_WIDTH - 160) {
          t.vx *= -1;
          t.x = Math.max(160, Math.min(ARENA_WIDTH - 160, t.x));
        }
      }
    }

    // Mise à jour bannière live de pénalité (1,5s tir bloqué / 3s bouclier cible)
    this.refreshPenaltyBanner();

    // Avancement des projectiles et collisions
    const nextProjectiles: ICampProjectile[] = [];
    for (const p of this.projectiles) {
      const stepX = p.vx * (dtMs / 1000);
      const stepY = p.vy * (dtMs / 1000);
      p.x += stepX;
      p.y += stepY;
      p.distanceTraveled += Math.hypot(stepX, stepY);

      let consumed = false;
      for (const t of this.targets) {
        if (t.hp <= 0) continue;
        const dist = Math.hypot(p.x - t.x, p.y - t.y);
        if (dist <= p.radius + t.radius) {
          consumed = true;
          this.handleProjectileHit(p, t);
          break;
        }
      }

      if (!consumed && p.distanceTraveled < p.maxRange) {
        nextProjectiles.push(p);
      }
    }
    this.projectiles = nextProjectiles;

    // Particules & textes flottants
    this.particles = this.particles.filter((pt) => {
      pt.x += pt.vx * (dtMs / 1000);
      pt.y += pt.vy * (dtMs / 1000);
      pt.lifeMs -= dtMs;
      return pt.lifeMs > 0;
    });

    this.floatingTexts = this.floatingTexts.filter((ft) => {
      ft.y -= 28 * (dtMs / 1000);
      ft.lifeMs -= dtMs;
      return ft.lifeMs > 0;
    });
  }

  private scheduleTransition(nextStep: CampTutorialStep, delayMs: number): void {
    if (this.pendingNextStep) return;
    this.pendingNextStep = nextStep;
    this.stepTransitionTimerMs = delayMs;
  }

  private firePlayerProjectile(angle: number): void {
    this.shootCooldownMs = 300;
    soundManager.playShoot(this.brawler.id);
    const accent = BRAWLER_ACCENTS[this.brawler.id].primary;
    this.projectiles.push({
      x: this.playerX + Math.cos(angle) * 20,
      y: this.playerY + Math.sin(angle) * 20,
      vx: Math.cos(angle) * 680,
      vy: Math.sin(angle) * 680,
      radius: 11,
      color: accent,
      distanceTraveled: 0,
      maxRange: Math.max(540, this.brawler.basic_attack.range),
    });
  }

  private handleProjectileHit(proj: ICampProjectile, target: ICampTarget): void {
    if (target.shieldRemainingMs > 0 && !proj.isSuperBolt) {
      soundManager.playHitError();
      this.spawnParticles(target.x, target.y, '#60a5fa', 10);
      this.spawnFloatingText(target.x, target.y - 38, '🛡️ INVINCIBLE !', '#93c5fd');
      return;
    }

    if (target.isCorrect || proj.isSuperBolt) {
      target.hp = 0;
      target.hitFlashMs = 200;
      soundManager.playHitCorrect(1.25);
      this.spawnParticles(target.x, target.y, '#ffd426', 24);
      this.spawnFloatingText(target.x, target.y - 40, '⭐ PARFAIT !', '#4ade80');

      if (this.step === 'STEP_2_AIM_QCM') {
        this.superGaugePct = 34;
        this.scheduleTransition('STEP_3_PENALTY_RULE', 750);
      } else if (this.step === 'STEP_3_PENALTY_RULE') {
        this.superGaugePct = 68;
        this.scheduleTransition('STEP_4_SUPER_DIPLOMA', 750);
      }
      return;
    }

    // Mauvaise cible : déclenche le blocage tir 1,5s + bouclier invincible 3s
    target.hitFlashMs = 240;
    target.shieldRemainingMs = ERROR_SHIELD_DURATION_MS;
    this.penaltyLockRemainingMs = ERROR_PENALTY_COOLDOWN_MS;
    this.step3DemoHitDone = true;

    soundManager.playHitError();
    this.spawnParticles(target.x, target.y, '#fb7185', 16);
    this.spawnFloatingText(target.x, target.y - 42, '🛡️ BOUCLIER 3s !', '#fda4af');
    this.spawnFloatingText(this.playerX, this.playerY - 46, '🔒 TIR BLOQUÉ 1,5s', '#fca5a5');

    if (this.step === 'STEP_3_PENALTY_RULE' && this.coachTextEl) {
      this.coachTextEl.textContent =
        'Regarde : tir bloqué 1,5s et cible invincible 3s ! Dès que ton tir revient, vise « Paris » !';
    }
  }

  private refreshPenaltyBanner(): void {
    if (!this.penaltyPillEl) return;
    const shieldTarget = this.targets.find((t) => t.shieldRemainingMs > 0);
    if (this.penaltyLockRemainingMs <= 0 && !shieldTarget) {
      this.penaltyPillEl.classList.add('is-hidden');
      return;
    }
    this.penaltyPillEl.classList.remove('is-hidden');
    const lockSec = (this.penaltyLockRemainingMs / 1000).toFixed(1);
    const shieldSec = ((shieldTarget?.shieldRemainingMs ?? 0) / 1000).toFixed(1);
    this.penaltyPillEl.innerHTML = `
      <span>🔒 Tir bloqué : <strong>${lockSec}s</strong> (1,5s)</span>
      <span>•</span>
      <span>🛡️ Cible invincible : <strong>${shieldSec}s</strong> (3,0s)</span>
    `;
  }

  private handleSuperTrigger(): void {
    if (this.step !== 'STEP_4_SUPER_DIPLOMA' || this.pendingNextStep) {
      return;
    }
    soundManager.playSuperCast();
    if (this.superBtnEl) {
      this.superBtnEl.disabled = true;
    }

    const boss = this.targets[0];
    if (boss) {
      this.playerX = boss.x;
      this.playerY = boss.y + 42;
      boss.hp = 0;
      this.spawnParticles(boss.x, boss.y, '#ffd426', 36);
      this.spawnParticles(boss.x, boss.y, '#38bdf8', 22);
      this.spawnFloatingText(
        boss.x,
        boss.y - 48,
        `⚡ ${this.brawler.super_ability.name.toUpperCase()} !`,
        '#ffd426'
      );
    }

    this.superGaugePct = 0;
    if (this.superPctEl) {
      this.superPctEl.textContent = 'DIPLÔME DÉBLOQUÉ !';
    }
    this.scheduleTransition('COMPLETED', 750);
  }

  private showDiplomaModal(): void {
    if (!this.rootEl) return;
    soundManager.playMatchEnd(true);

    const existing = this.rootEl.querySelector('.ftue-camp-diploma-overlay');
    existing?.remove();

    const durationSec = Math.max(1, Math.round(this.totalElapsedMs / 1000));
    const diplomaTitle = `Diplôme d'Entrée en 6ème — ${this.brawler.name}`;

    const modal = document.createElement('div');
    modal.className = 'ftue-camp-diploma-overlay brawl-pop';
    modal.innerHTML = `
      <div class="ftue-camp-diploma-card">
        <div style="font-size:56px; line-height:1; margin-bottom:8px;">🎓</div>
        <div class="brawl-outline-text" style="font-size:12px; color:#38bdf8; letter-spacing:1.2px;">
          CAMP D'ENTRAÎNEMENT TERMINÉ !
        </div>
        <h2 class="brawl-title" style="margin:6px 0 8px; font-size:28px; color:#ffd426;">
          DIPLÔME D'ENTRÉE EN 6ÈME
        </h2>
        <p style="margin:0 0 16px; font-size:14px; color:#e2e8f0; line-height:1.45;">
          Bravo <strong style="color:#fde047;">${escapeHtml(this.playerNickname)}</strong> !
          Tu maîtrises le déplacement double stick, le tir QCM, la règle du bouclier 1,5s et ton Super !
        </p>

        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px;">
          <div style="background:rgba(15,23,42,0.85); border:2.5px solid #090d16; border-radius:14px; padding:10px;">
            <div style="font-size:18px; font-weight:900; color:#4ade80;">4 / 4</div>
            <div style="font-size:11px; color:#cbd5e1; font-weight:700;">Étapes Validées</div>
          </div>
          <div style="background:rgba(15,23,42,0.85); border:2.5px solid #090d16; border-radius:14px; padding:10px;">
            <div style="font-size:18px; font-weight:900; color:#38bdf8;">${durationSec}s</div>
            <div style="font-size:11px; color:#cbd5e1; font-weight:700;">Temps Camp</div>
          </div>
          <div style="background:rgba(15,23,42,0.85); border:2.5px solid #090d16; border-radius:14px; padding:10px;">
            <div style="font-size:18px; font-weight:900; color:#ffd426;">🎁 ×1</div>
            <div style="font-size:11px; color:#cbd5e1; font-weight:700;">Casier Offert</div>
          </div>
        </div>

        <button id="ftue-camp-finish-btn" type="button" class="brawl-btn brawl-btn-lg brawl-btn-yellow brawl-pulse" style="width:100%;">
          🎁 OUVRIR MON 1ER CASIER MYSTÈRE !
        </button>
      </div>
    `;

    this.rootEl.appendChild(modal);
    modal.querySelector<HTMLButtonElement>('#ftue-camp-finish-btn')?.addEventListener('click', () => {
      playSafeUiSound();
      const summary: ICampCompletionSummary = {
        brawlerId: this.brawler.id,
        completedSteps: 4,
        durationSeconds: durationSec,
        diplomaTitle,
      };
      this.stop();
      this.options.onComplete?.(summary);
    });
  }

  private spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 70 + Math.random() * 190;
      const life = 350 + Math.random() * 350;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        lifeMs: life,
        maxLifeMs: life,
        size: 3.5 + Math.random() * 4.5,
        color,
      });
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      lifeMs: 1200,
      maxLifeMs: 1200,
    });
  }

  private render(): void {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { scale, offsetX, offsetY, cssW, cssH } = this.getCanvasTransform();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Fond ciel/cour du collège
    const bgGrad = ctx.createLinearGradient(0, 0, 0, cssH);
    bgGrad.addColorStop(0, '#0b1437');
    bgGrad.addColorStop(1, '#172554');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    // Sol isométrique 50° du Camp d'Entraînement
    const arenaScreenW = ARENA_WIDTH * scale;
    const arenaScreenH = ARENA_HEIGHT * ISO_Y_SCALE * scale;
    ctx.save();
    ctx.fillStyle = '#1e3a5f';
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(offsetX, offsetY, arenaScreenW, arenaScreenH, 18);
    ctx.fill();
    ctx.stroke();

    // Damier terrain scolaire
    ctx.clip();
    const tileW = 80 * scale;
    const tileH = 80 * ISO_Y_SCALE * scale;
    for (let gx = 0; gx < ARENA_WIDTH; gx += 80) {
      for (let gy = 0; gy < ARENA_HEIGHT; gy += 80) {
        const isAlt = ((gx / 80) + (gy / 80)) % 2 === 0;
        ctx.fillStyle = isAlt ? 'rgba(30, 64, 175, 0.25)' : 'rgba(15, 23, 42, 0.22)';
        ctx.fillRect(
          offsetX + gx * scale,
          offsetY + gy * ISO_Y_SCALE * scale,
          tileW,
          tileH
        );
      }
    }
    ctx.restore();

    // Étape 1 : Zone bleue à atteindre + flèche animée
    if (this.step === 'STEP_1_MOVE') {
      const zp = this.worldToScreen(this.blueZone.x, this.blueZone.y);
      const pulse = 1 + Math.sin(this.totalElapsedMs * 0.006) * 0.08;
      const rx = this.blueZone.radius * scale * pulse;
      const ry = this.blueZone.radius * ISO_Y_SCALE * scale * pulse;

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(zp.x, zp.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const pp = this.worldToScreen(this.playerX, this.playerY);
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pp.x, pp.y);
      ctx.lineTo(zp.x, zp.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e0f2fe';
      ctx.fillText('ZONE BLEUE', zp.x, zp.y + 4);
      ctx.restore();
    }

    // Drones / Cibles QCM
    for (const t of this.targets) {
      if (t.hp <= 0) continue;
      const tp = this.worldToScreen(t.x, t.y);
      const rScreen = t.radius * scale;
      const bobY = Math.sin(this.totalElapsedMs * 0.005 + t.x) * 5;

      ctx.save();
      // Ombre au sol
      ctx.fillStyle = 'rgba(9, 13, 22, 0.45)';
      ctx.beginPath();
      ctx.ellipse(tp.x, tp.y + 18 * scale, rScreen * 0.85, rScreen * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Corps du drone
      ctx.fillStyle =
        t.hitFlashMs > 0
          ? '#ffffff'
          : t.shieldRemainingMs > 0
            ? '#334155'
            : t.isCorrect
              ? '#1e40af'
              : '#3b0764';
      ctx.strokeStyle = t.shieldRemainingMs > 0 ? '#60a5fa' : '#090d16';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y + bobY, rScreen, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Bouclier d'invincibilité 3s
      if (t.shieldRemainingMs > 0) {
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y + bobY, rScreen + 11 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = '900 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#bae6fd';
        ctx.fillText(
          `🛡️ ${(t.shieldRemainingMs / 1000).toFixed(1)}s`,
          tp.x,
          tp.y + bobY - rScreen - 14
        );
      }

      // Étiquette de réponse
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t.label, tp.x, tp.y + bobY);
      ctx.restore();
    }

    // Héros du joueur
    const pp = this.worldToScreen(this.playerX, this.playerY);
    const pRadiusScreen = PLAYER_RADIUS * scale;
    const accent = BRAWLER_ACCENTS[this.brawler.id];

    ctx.save();
    // Anneau au sol
    ctx.strokeStyle = this.penaltyLockRemainingMs > 0 ? '#fb7185' : accent.primary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(pp.x, pp.y + 12 * scale, pRadiusScreen * 1.15, pRadiusScreen * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Ligne de visée quand tir débloqué
    if (this.step === 'STEP_2_AIM_QCM' || (this.step === 'STEP_3_PENALTY_RULE' && this.step3DemoHitDone)) {
      const aimEnd = this.worldToScreen(
        this.playerX + Math.cos(this.aimAngle) * 180,
        this.playerY + Math.sin(this.aimAngle) * 180
      );
      ctx.strokeStyle =
        this.penaltyLockRemainingMs > 0 ? 'rgba(251, 113, 133, 0.5)' : 'rgba(250, 204, 21, 0.55)';
      ctx.setLineDash([7, 6]);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(pp.x, pp.y);
      ctx.lineTo(aimEnd.x, aimEnd.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Corps du Héros
    ctx.fillStyle = accent.secondary;
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, pRadiusScreen, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.font = `${Math.round(18 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(accent.badge, pp.x, pp.y);

    // Indicateur de tir bloqué au-dessus du héros (1,5s)
    if (this.penaltyLockRemainingMs > 0) {
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.fillStyle = '#fecdd3';
      ctx.fillText(
        `🔒 ${(this.penaltyLockRemainingMs / 1000).toFixed(1)}s`,
        pp.x,
        pp.y - pRadiusScreen - 14
      );
    }
    ctx.restore();

    // Projectiles
    for (const pr of this.projectiles) {
      const prScreen = this.worldToScreen(pr.x, pr.y);
      ctx.save();
      ctx.fillStyle = pr.color;
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(prScreen.x, prScreen.y, pr.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Particules
    for (const pt of this.particles) {
      const pts = this.worldToScreen(pt.x, pt.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.lifeMs / pt.maxLifeMs);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pts.x, pts.y, pt.size * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Textes flottants
    for (const ft of this.floatingTexts) {
      const fts = this.worldToScreen(ft.x, ft.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.lifeMs / 450));
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, fts.x, fts.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, fts.x, fts.y);
      ctx.restore();
    }

    // Joysticks actifs
    if (this.controller) {
      const left = this.controller.getLeftStickRender();
      if (left.active) {
        this.drawStickCircle(ctx, left.originX, left.originY, left.currentX, left.currentY, '#38bdf8');
      }
      const right = this.controller.getRightStickRender();
      if (right.active && this.step !== 'STEP_1_MOVE') {
        this.drawStickCircle(ctx, right.originX, right.originY, right.currentX, right.currentY, '#ffd426');
      }
    }

    ctx.restore();
  }

  private drawStickCircle(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    cx: number,
    cy: number,
    color: string
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ox, oy, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
