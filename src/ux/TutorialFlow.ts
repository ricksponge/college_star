import type { BrawlerId, IAccessibilitySettings, IQuestion } from '../types/cctp';
import { getBrawlerById } from '../entities/Brawlers';
import { soundManager } from '../services/SoundManager';

export type TutorialStepId = 'MOVE_STICK' | 'SHOOT_QCM' | 'ACTIVATE_SUPER';

export interface ITutorialCompleteResult {
  completedInSec: number;
  skipped: boolean;
}

export interface ITutorialFlowState {
  active: boolean;
  currentStep: TutorialStepId;
  stepIndex: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  moveProgressPct: number;
}

export interface ITutorialFlowOptions {
  /** Conteneur hôte (défaut : document.body) */
  container?: HTMLElement;
  /** Héros sélectionné pour personnaliser le nom du Super (défaut : 'TIMO') */
  brawlerId?: BrawlerId;
  /** Question QCM jouée à l'étape 2 (défaut : '7 × 8 ?' -> '56') */
  question?: IQuestion;
  /** Distance à parcourir à l'étape 1 en pixels (défaut : 160) */
  targetMoveDistancePx?: number;
  /** Durée maximale du tutoriel en secondes (défaut : 45) */
  maxDurationSec?: number;
  /** Paramètres d'accessibilité éventuels */
  accessibility?: Partial<IAccessibilitySettings>;
  /** Mode bac à sable autonome cliquable (défaut : false pour superposer au canvas) */
  playableSandbox?: boolean;
  /** Active les retours sonores Web Audio (défaut : true) */
  enableSound?: boolean;
  /** Notifié à chaque changement d'étape */
  onStepChange?: (step: TutorialStepId, stepIndex: number) => void;
  /** Notifié à la fin ou au passage du tutoriel */
  onComplete: (result: ITutorialCompleteResult) => void;
}

interface IStepDefinition {
  id: TutorialStepId;
  index: number;
  budgetSec: number;
  shortLabel: string;
  badgeText: string;
  headline: string;
  subline: string;
  accentColor: string;
}

const STYLE_ID = 'brawl-ux-tutorial-styles';
const DEFAULT_MAX_DURATION_SEC = 45;
const DEFAULT_MOVE_TARGET_PX = 160;

const DEFAULT_TUTORIAL_QUESTION: IQuestion = {
  id: 'UX_TUTO_MATH_7X8',
  subject: 'mathematiques',
  skill_code: 'MATH_MUL',
  elo_difficulty: 850,
  hud_prompt: '7 × 8 ?',
  explanation_flash: 'Astuce : 7 × 8 = 56 !',
  targets: [
    { label: '56', is_correct: true },
    { label: '54', is_correct: false },
    { label: '64', is_correct: false },
  ],
};

function injectTutorialStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .brawl-ux-tuto-root {
      position: fixed;
      inset: 0;
      z-index: 9500;
      pointer-events: none;
      font-family: var(--brawl-font-ui, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif);
      color: #f8fafc;
      user-select: none;
      -webkit-user-select: none;
    }

    .brawl-ux-tuto-root.is-sandbox {
      pointer-events: auto;
      background: radial-gradient(circle at 50% 45%, rgba(21, 33, 92, 0.72), rgba(6, 9, 24, 0.88));
      backdrop-filter: blur(4px);
    }

    .brawl-ux-tuto-topbar {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: min(640px, calc(100vw - 24px));
      background: linear-gradient(180deg, rgba(19, 29, 71, 0.96) 0%, rgba(11, 17, 41, 0.97) 100%);
      border: 3px solid var(--brawl-ink, #090d16);
      border-radius: 18px;
      padding: 10px 14px;
      box-shadow: 0 6px 0 var(--brawl-ink, #090d16), 0 14px 28px rgba(0, 0, 0, 0.55);
      display: flex;
      flex-direction: column;
      gap: 8px;
      animation: brawl-ux-tuto-drop 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .brawl-ux-tuto-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .brawl-ux-tuto-steps {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .brawl-ux-tuto-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 9px;
      border-radius: 999px;
      border: 2px solid var(--brawl-ink, #090d16);
      background: rgba(30, 41, 59, 0.9);
      color: #94a3b8;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.02em;
      transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease;
    }

    .brawl-ux-tuto-pill.is-active {
      background: linear-gradient(180deg, #ffe75e 0%, #f59e0b 100%);
      color: #1c1200;
      transform: scale(1.04);
      box-shadow: 0 0 14px rgba(255, 212, 38, 0.45);
    }

    .brawl-ux-tuto-pill.is-done {
      background: linear-gradient(180deg, #62f578 0%, #16a34a 100%);
      color: #052e16;
    }

    .brawl-ux-tuto-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .brawl-ux-tuto-timer {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #090e24;
      border: 2px solid var(--brawl-ink, #090d16);
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 13px;
      font-weight: 900;
      color: #ffd426;
      min-width: 62px;
      justify-content: center;
    }

    .brawl-ux-tuto-timer.is-urgent {
      color: #fb7185;
      animation: brawl-ux-tuto-pulse 0.8s ease-in-out infinite;
    }

    .brawl-ux-tuto-skip {
      pointer-events: auto;
      padding: 5px 12px;
      border-radius: 11px;
      border: 2.5px solid var(--brawl-ink, #090d16);
      background: linear-gradient(180deg, #475569 0%, #1e293b 100%);
      color: #f8fafc;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: 0 3px 0 var(--brawl-ink, #090d16);
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .brawl-ux-tuto-skip:active {
      transform: translateY(2px);
      box-shadow: 0 1px 0 var(--brawl-ink, #090d16);
    }

    .brawl-ux-tuto-headline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }

    .brawl-ux-tuto-title {
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 15px;
      font-weight: 900;
      color: #ffffff;
      text-shadow: 0 2px 0 var(--brawl-ink, #090d16);
    }

    .brawl-ux-tuto-sub {
      font-size: 13px;
      font-weight: 800;
      color: #fef08a;
    }

    .brawl-ux-tuto-bar-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: #080d22;
      border: 2px solid var(--brawl-ink, #090d16);
      overflow: hidden;
    }

    .brawl-ux-tuto-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #22b8ff 0%, #38e54d 55%, #ffd426 100%);
      transition: width 0.2s linear;
    }

    .brawl-ux-tuto-cue {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      pointer-events: none;
    }

    .brawl-ux-tuto-cue.pos-left-stick {
      left: max(22px, 6vw);
      bottom: max(56px, 12vh);
    }

    .brawl-ux-tuto-cue.pos-right-stick {
      right: max(36px, 9vw);
      bottom: max(126px, 22vh);
    }

    .brawl-ux-tuto-cue.pos-super-btn {
      right: 22px;
      bottom: 122px;
    }

    .brawl-ux-tuto-beacon {
      position: absolute;
      left: 50%;
      top: 52%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      pointer-events: none;
    }

    .brawl-ux-tuto-beacon-ring {
      width: 88px;
      height: 88px;
      border-radius: 999px;
      border: 4px dashed #ffd426;
      background: radial-gradient(circle, rgba(255, 212, 38, 0.28) 0%, rgba(255, 212, 38, 0.03) 70%);
      box-shadow: 0 0 26px rgba(255, 212, 38, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      animation: brawl-ux-tuto-pulse 1.2s ease-in-out infinite;
    }

    .brawl-ux-tuto-stick-pad {
      position: relative;
      width: 96px;
      height: 96px;
      border-radius: 999px;
      border: 3px dashed rgba(56, 189, 248, 0.85);
      background: radial-gradient(circle, rgba(34, 184, 255, 0.22) 0%, rgba(9, 13, 22, 0.35) 75%);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brawl-ux-tuto-stick-pad.is-aim {
      border-color: rgba(255, 212, 38, 0.9);
      background: radial-gradient(circle, rgba(255, 212, 38, 0.22) 0%, rgba(9, 13, 22, 0.35) 75%);
    }

    .brawl-ux-tuto-finger {
      font-size: 34px;
      line-height: 1;
      filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.65));
      will-change: transform;
    }

    .brawl-ux-tuto-finger.anim-move {
      animation: brawl-ux-finger-orbit 1.5s ease-in-out infinite;
    }

    .brawl-ux-tuto-finger.anim-aim {
      animation: brawl-ux-finger-drag 1.4s ease-in-out infinite;
    }

    .brawl-ux-tuto-finger.anim-tap {
      animation: brawl-ux-finger-tap 0.9s ease-in-out infinite;
    }

    .brawl-ux-tuto-chip {
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(9, 13, 22, 0.9);
      border: 2px solid var(--brawl-ink, #090d16);
      font-size: 11px;
      font-weight: 900;
      color: #f8fafc;
      white-space: nowrap;
      box-shadow: 0 3px 0 var(--brawl-ink, #090d16);
    }

    .brawl-ux-tuto-qcm-card {
      position: absolute;
      left: 50%;
      top: 46%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 12px 18px;
      border-radius: 18px;
      background: rgba(15, 23, 42, 0.9);
      border: 3px solid #ffd426;
      box-shadow: 0 6px 0 var(--brawl-ink, #090d16), 0 0 26px rgba(255, 212, 38, 0.35);
    }

    .brawl-ux-tuto-sandbox-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      margin-top: 4px;
      pointer-events: auto;
    }

    .brawl-ux-tuto-sandbox-btn {
      pointer-events: auto;
      padding: 10px 18px;
      border-radius: 14px;
      border: 3px solid var(--brawl-ink, #090d16);
      background: linear-gradient(180deg, #56d4ff 0%, #0284c7 100%);
      color: #ffffff;
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 15px;
      font-weight: 900;
      cursor: pointer;
      box-shadow: 0 4px 0 var(--brawl-ink, #090d16);
      touch-action: manipulation;
    }

    .brawl-ux-tuto-sandbox-btn.is-gold {
      background: linear-gradient(180deg, #ffe75e 0%, #f59e0b 100%);
      color: #1c1200;
    }

    .brawl-ux-tuto-feedback {
      position: absolute;
      left: 50%;
      top: 126px;
      transform: translateX(-50%);
      padding: 6px 14px;
      border-radius: 999px;
      background: #16a34a;
      border: 2.5px solid var(--brawl-ink, #090d16);
      font-family: var(--brawl-font-display, 'Arial Black', sans-serif);
      font-size: 13px;
      font-weight: 900;
      color: #ffffff;
      box-shadow: 0 4px 0 var(--brawl-ink, #090d16);
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .brawl-ux-tuto-feedback.is-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(2px);
    }

    @keyframes brawl-ux-tuto-drop {
      from { opacity: 0; transform: translate(-50%, -14px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }

    @keyframes brawl-ux-tuto-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.07); }
    }

    @keyframes brawl-ux-finger-orbit {
      0% { transform: translate(0, 0); }
      35% { transform: translate(22px, -14px); }
      70% { transform: translate(10px, -22px); }
      100% { transform: translate(0, 0); }
    }

    @keyframes brawl-ux-finger-drag {
      0% { transform: translate(0, 0) scale(1); }
      55% { transform: translate(-24px, -22px) scale(0.94); }
      100% { transform: translate(0, 0) scale(1); }
    }

    @keyframes brawl-ux-finger-tap {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(10px) scale(0.88); }
    }

    @media (prefers-reduced-motion: reduce) {
      .brawl-ux-tuto-topbar,
      .brawl-ux-tuto-timer.is-urgent,
      .brawl-ux-tuto-beacon-ring,
      .brawl-ux-tuto-finger {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Tutoriel interactif jouable de 45 secondes max (« Zéro Friction Scolaire ») :
 * 1. MOVE_STICK (~12s) : Déplacement au stick gauche vers le marqueur doré.
 * 2. SHOOT_QCM (~18s) : Viser et tirer au stick droit sur la bonne réponse QCM.
 * 3. ACTIVATE_SUPER (~15s) : Déclencher l'attaque Super jaune à 100%.
 */
export class TutorialFlow {
  private readonly options: ITutorialFlowOptions;
  private readonly container: HTMLElement;
  private readonly brawlerId: BrawlerId;
  private readonly question: IQuestion;
  private readonly targetMoveDistancePx: number;
  private readonly maxDurationMs: number;
  private readonly playableSandbox: boolean;
  private readonly enableSound: boolean;
  private readonly steps: IStepDefinition[];

  private rootEl: HTMLDivElement | null = null;
  private timerEl: HTMLElement | null = null;
  private barFillEl: HTMLElement | null = null;
  private stepBodyEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private subEl: HTMLElement | null = null;
  private feedbackEl: HTMLElement | null = null;
  private pillEls: Map<TutorialStepId, HTMLElement> = new Map();
  private movePctEl: HTMLElement | null = null;

  private active = false;
  private completed = false;
  private destroyed = false;
  private currentStepIndex = 0;
  private movedDistancePx = 0;
  private startedAtMs = 0;
  private tickIntervalId: number | null = null;
  private feedbackTimerId: number | null = null;

  constructor(options: ITutorialFlowOptions) {
    this.options = options;
    this.container = options.container ?? document.body;
    this.brawlerId = options.brawlerId ?? 'TIMO';
    this.question = options.question ?? DEFAULT_TUTORIAL_QUESTION;
    const baseMoveTarget = Math.max(40, options.targetMoveDistancePx ?? DEFAULT_MOVE_TARGET_PX);
    this.targetMoveDistancePx = options.accessibility?.calm_mode
      ? Math.round(baseMoveTarget * 0.85)
      : baseMoveTarget;
    this.maxDurationMs = Math.max(10, options.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC) * 1000;
    this.playableSandbox = Boolean(options.playableSandbox);
    this.enableSound = options.enableSound !== false;

    const brawler = getBrawlerById(this.brawlerId);
    const correctTarget =
      this.question.targets.find((t) => t.is_correct)?.label ?? '56';

    this.steps = [
      {
        id: 'MOVE_STICK',
        index: 0,
        budgetSec: 12,
        shortLabel: '1. Stick Gauche',
        badgeText: 'Étape 1/3 (~12s)',
        headline: 'Bouge vers le marqueur doré',
        subline: 'Glisse le stick gauche (ou ZQSD)',
        accentColor: '#22b8ff',
      },
      {
        id: 'SHOOT_QCM',
        index: 1,
        budgetSec: 18,
        shortLabel: '2. Tir QCM',
        badgeText: 'Étape 2/3 (~18s)',
        headline: `${this.question.hud_prompt} ➔ Vise ${correctTarget}`,
        subline: 'Glisse le stick droit ou touche la cible',
        accentColor: '#ffd426',
      },
      {
        id: 'ACTIVATE_SUPER',
        index: 2,
        budgetSec: 15,
        shortLabel: '3. Super 100%',
        badgeText: 'Étape 3/3 (~15s)',
        headline: `Déclenche ${brawler.super_ability.name} !`,
        subline: 'Appuie sur le bouton jaune SUPER (ou Espace)',
        accentColor: '#fbbf24',
      },
    ];
  }

  public start(): void {
    if (this.destroyed) {
      return;
    }
    this.cleanupDomAndTimers();
    injectTutorialStyles();

    this.active = true;
    this.completed = false;
    this.currentStepIndex = 0;
    this.movedDistancePx = 0;
    this.startedAtMs = this.nowMs();

    this.renderOverlay();
    this.renderCurrentStep();
    this.updateTimerVisuals();

    this.tickIntervalId = window.setInterval(() => {
      this.onTimerTick();
    }, 200);

    const firstStep = this.steps[0];
    this.options.onStepChange?.(firstStep.id, 0);
  }

  public onStepMoveDistance(distancePx: number): void {
    if (!this.active || this.completed) {
      return;
    }
    if (this.getCurrentStep() !== 'MOVE_STICK') {
      return;
    }
    if (!Number.isFinite(distancePx) || distancePx <= 0) {
      return;
    }

    this.movedDistancePx = Math.min(
      this.targetMoveDistancePx,
      this.movedDistancePx + distancePx
    );

    const pct = Math.round((this.movedDistancePx / this.targetMoveDistancePx) * 100);
    if (this.movePctEl) {
      this.movePctEl.textContent = `Marqueur doré : ${pct}%`;
    }

    if (this.movedDistancePx >= this.targetMoveDistancePx) {
      this.advanceToNextStep('✨ Déplacement validé !');
    }
  }

  public onCorrectQcmShot(): void {
    if (!this.active || this.completed) {
      return;
    }
    if (this.getCurrentStep() !== 'SHOOT_QCM') {
      return;
    }
    if (this.enableSound) {
      soundManager.playSuperReady();
    }
    this.advanceToNextStep('🎯 Bonne réponse ! Super à 100% !');
  }

  public onSuperActivated(): void {
    if (!this.active || this.completed) {
      return;
    }
    if (this.getCurrentStep() !== 'ACTIVATE_SUPER') {
      return;
    }
    if (this.enableSound) {
      soundManager.playSuperCast();
    }
    this.finish(false);
  }

  public skip(): void {
    if (!this.active || this.completed) {
      return;
    }
    this.finish(true);
  }

  public getCurrentStep(): TutorialStepId {
    return this.steps[this.currentStepIndex]?.id ?? 'ACTIVATE_SUPER';
  }

  public getState(): ITutorialFlowState {
    const elapsedMs = this.active ? Math.max(0, this.nowMs() - this.startedAtMs) : 0;
    const remainingMs = Math.max(0, this.maxDurationMs - elapsedMs);
    return {
      active: this.active,
      currentStep: this.getCurrentStep(),
      stepIndex: this.currentStepIndex,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      elapsedSeconds: Math.round(elapsedMs / 100) / 10,
      moveProgressPct: Math.min(
        100,
        Math.round((this.movedDistancePx / this.targetMoveDistancePx) * 100)
      ),
    };
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.active = false;
    this.cleanupDomAndTimers();
  }

  private renderOverlay(): void {
    const root = document.createElement('div');
    root.className = `brawl-ux-tuto-root${this.playableSandbox ? ' is-sandbox' : ''}`;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Tutoriel interactif Brawl Collège');

    const topbar = document.createElement('div');
    topbar.className = 'brawl-ux-tuto-topbar';

    const topRow = document.createElement('div');
    topRow.className = 'brawl-ux-tuto-row';

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'brawl-ux-tuto-steps';
    this.pillEls.clear();

    for (const step of this.steps) {
      const pill = document.createElement('span');
      pill.className = 'brawl-ux-tuto-pill';
      pill.textContent = step.shortLabel;
      this.pillEls.set(step.id, pill);
      stepsWrap.appendChild(pill);
    }

    const controls = document.createElement('div');
    controls.className = 'brawl-ux-tuto-controls';

    const timer = document.createElement('span');
    timer.className = 'brawl-ux-tuto-timer';
    timer.textContent = `⏱️ ${Math.round(this.maxDurationMs / 1000)}s`;

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'brawl-ux-tuto-skip';
    skipBtn.textContent = 'Passer ⏭️';
    skipBtn.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
    });
    skipBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.skip();
    });

    controls.appendChild(timer);
    controls.appendChild(skipBtn);
    topRow.appendChild(stepsWrap);
    topRow.appendChild(controls);

    const headlineRow = document.createElement('div');
    headlineRow.className = 'brawl-ux-tuto-headline';

    const titleEl = document.createElement('div');
    titleEl.className = 'brawl-ux-tuto-title';

    const subEl = document.createElement('div');
    subEl.className = 'brawl-ux-tuto-sub';

    headlineRow.appendChild(titleEl);
    headlineRow.appendChild(subEl);

    const barTrack = document.createElement('div');
    barTrack.className = 'brawl-ux-tuto-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'brawl-ux-tuto-bar-fill';
    barFill.style.width = '100%';
    barTrack.appendChild(barFill);

    topbar.appendChild(topRow);
    topbar.appendChild(headlineRow);
    topbar.appendChild(barTrack);

    const stepBody = document.createElement('div');
    const feedback = document.createElement('div');
    feedback.className = 'brawl-ux-tuto-feedback';

    root.appendChild(topbar);
    root.appendChild(stepBody);
    root.appendChild(feedback);

    this.rootEl = root;
    this.timerEl = timer;
    this.barFillEl = barFill;
    this.titleEl = titleEl;
    this.subEl = subEl;
    this.stepBodyEl = stepBody;
    this.feedbackEl = feedback;

    this.container.appendChild(root);
  }

  private renderCurrentStep(): void {
    const step = this.steps[this.currentStepIndex];
    if (!step || !this.stepBodyEl || !this.titleEl || !this.subEl) {
      return;
    }

    this.titleEl.textContent = `${step.badgeText} — ${step.headline}`;
    this.subEl.textContent = step.subline;

    for (const item of this.steps) {
      const pill = this.pillEls.get(item.id);
      if (!pill) continue;
      pill.classList.toggle('is-active', item.index === this.currentStepIndex);
      pill.classList.toggle('is-done', item.index < this.currentStepIndex);
    }

    this.stepBodyEl.replaceChildren();
    this.movePctEl = null;

    if (step.id === 'MOVE_STICK') {
      this.renderMoveStickCue(this.stepBodyEl);
    } else if (step.id === 'SHOOT_QCM') {
      this.renderShootQcmCue(this.stepBodyEl);
    } else {
      this.renderSuperCue(this.stepBodyEl);
    }
  }

  private renderMoveStickCue(host: HTMLElement): void {
    const beacon = document.createElement('div');
    beacon.className = 'brawl-ux-tuto-beacon';

    const ring = document.createElement('div');
    ring.className = 'brawl-ux-tuto-beacon-ring';
    ring.textContent = '⭐';

    const pctChip = document.createElement('div');
    pctChip.className = 'brawl-ux-tuto-chip';
    const pct = Math.round((this.movedDistancePx / this.targetMoveDistancePx) * 100);
    pctChip.textContent = `Marqueur doré : ${pct}%`;
    this.movePctEl = pctChip;

    beacon.appendChild(ring);
    beacon.appendChild(pctChip);

    if (this.playableSandbox) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brawl-ux-tuto-sandbox-btn';
      btn.textContent = '🕹️ Avancer vers le marqueur';
      btn.addEventListener('click', () => {
        this.onStepMoveDistance(Math.ceil(this.targetMoveDistancePx / 2));
      });
      beacon.appendChild(btn);
    }

    const leftCue = document.createElement('div');
    leftCue.className = 'brawl-ux-tuto-cue pos-left-stick';

    const pad = document.createElement('div');
    pad.className = 'brawl-ux-tuto-stick-pad';
    const finger = document.createElement('span');
    finger.className = 'brawl-ux-tuto-finger anim-move';
    finger.textContent = '👆';
    pad.appendChild(finger);

    const label = document.createElement('div');
    label.className = 'brawl-ux-tuto-chip';
    label.textContent = 'Stick gauche : Bouger';

    leftCue.appendChild(pad);
    leftCue.appendChild(label);

    host.appendChild(beacon);
    host.appendChild(leftCue);
  }

  private renderShootQcmCue(host: HTMLElement): void {
    const qcmCard = document.createElement('div');
    qcmCard.className = 'brawl-ux-tuto-qcm-card';

    const prompt = document.createElement('div');
    prompt.className = 'brawl-ux-tuto-title';
    prompt.style.fontSize = '18px';
    prompt.style.color = '#ffd426';
    prompt.textContent = `🎯 ${this.question.hud_prompt}`;
    qcmCard.appendChild(prompt);

    if (this.playableSandbox) {
      const actions = document.createElement('div');
      actions.className = 'brawl-ux-tuto-sandbox-actions';
      for (const target of this.question.targets) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'brawl-ux-tuto-sandbox-btn';
        btn.textContent = target.label;
        btn.addEventListener('click', () => {
          if (target.is_correct) {
            this.onCorrectQcmShot();
          } else {
            this.showFeedback(this.question.explanation_flash);
          }
        });
        actions.appendChild(btn);
      }
      qcmCard.appendChild(actions);
    } else {
      const correctLabel =
        this.question.targets.find((t) => t.is_correct)?.label ?? '56';
      const hintChip = document.createElement('div');
      hintChip.className = 'brawl-ux-tuto-chip';
      hintChip.textContent = `Vise le drone « ${correctLabel} »`;
      qcmCard.appendChild(hintChip);
    }

    const rightCue = document.createElement('div');
    rightCue.className = 'brawl-ux-tuto-cue pos-right-stick';

    const pad = document.createElement('div');
    pad.className = 'brawl-ux-tuto-stick-pad is-aim';
    const finger = document.createElement('span');
    finger.className = 'brawl-ux-tuto-finger anim-aim';
    finger.textContent = '👆';
    pad.appendChild(finger);

    const label = document.createElement('div');
    label.className = 'brawl-ux-tuto-chip';
    label.textContent = 'Stick droit : Viser & Tirer';

    rightCue.appendChild(pad);
    rightCue.appendChild(label);

    host.appendChild(qcmCard);
    host.appendChild(rightCue);
  }

  private renderSuperCue(host: HTMLElement): void {
    const brawler = getBrawlerById(this.brawlerId);
    const superCue = document.createElement('div');
    superCue.className = 'brawl-ux-tuto-cue pos-super-btn';

    const chip = document.createElement('div');
    chip.className = 'brawl-ux-tuto-chip';
    chip.style.borderColor = '#ffd426';
    chip.style.color = '#ffd426';
    chip.textContent = `⚡ ${brawler.super_ability.name} (100%)`;

    const finger = document.createElement('span');
    finger.className = 'brawl-ux-tuto-finger anim-tap';
    finger.textContent = '👇';

    superCue.appendChild(chip);
    superCue.appendChild(finger);

    if (this.playableSandbox) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'brawl-ux-tuto-sandbox-btn is-gold';
      btn.textContent = `⚡ SUPER : ${brawler.super_ability.name.toUpperCase()}`;
      btn.addEventListener('click', () => {
        this.onSuperActivated();
      });
      superCue.appendChild(btn);
    }

    host.appendChild(superCue);
  }

  private advanceToNextStep(feedbackMsg: string): void {
    if (this.enableSound && this.getCurrentStep() === 'MOVE_STICK') {
      soundManager.playHitCorrect(1.0);
    }
    this.showFeedback(feedbackMsg);

    const nextIndex = this.currentStepIndex + 1;
    if (nextIndex >= this.steps.length) {
      this.finish(false);
      return;
    }

    this.currentStepIndex = nextIndex;
    this.renderCurrentStep();
    this.options.onStepChange?.(this.steps[nextIndex].id, nextIndex);
  }

  private showFeedback(message: string): void {
    if (!this.feedbackEl) {
      return;
    }
    this.feedbackEl.textContent = message;
    this.feedbackEl.classList.add('is-visible');

    if (this.feedbackTimerId !== null) {
      window.clearTimeout(this.feedbackTimerId);
    }
    this.feedbackTimerId = window.setTimeout(() => {
      this.feedbackEl?.classList.remove('is-visible');
      this.feedbackTimerId = null;
    }, 1500);
  }

  private onTimerTick(): void {
    if (!this.active || this.completed) {
      return;
    }
    const elapsedMs = Math.max(0, this.nowMs() - this.startedAtMs);
    this.updateTimerVisuals();

    if (elapsedMs >= this.maxDurationMs) {
      this.finish(false);
    }
  }

  private updateTimerVisuals(): void {
    const elapsedMs = Math.max(0, this.nowMs() - this.startedAtMs);
    const remainingMs = Math.max(0, this.maxDurationMs - elapsedMs);
    const remainingSec = Math.ceil(remainingMs / 1000);
    const remainingPct = Math.max(0, Math.min(100, (remainingMs / this.maxDurationMs) * 100));

    if (this.timerEl) {
      this.timerEl.textContent = `⏱️ ${remainingSec}s`;
      this.timerEl.classList.toggle('is-urgent', remainingSec <= 10);
    }
    if (this.barFillEl) {
      this.barFillEl.style.width = `${remainingPct}%`;
    }
  }

  private finish(skipped: boolean): void {
    if (this.completed) {
      return;
    }
    this.completed = true;
    this.active = false;

    const elapsedSec = Math.min(
      this.maxDurationMs / 1000,
      Math.max(0, Math.round(((this.nowMs() - this.startedAtMs) / 1000) * 10) / 10)
    );

    this.cleanupDomAndTimers();
    this.options.onComplete({
      completedInSec: elapsedSec,
      skipped,
    });
  }

  private cleanupDomAndTimers(): void {
    if (this.tickIntervalId !== null) {
      window.clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    if (this.feedbackTimerId !== null) {
      window.clearTimeout(this.feedbackTimerId);
      this.feedbackTimerId = null;
    }
    this.pillEls.clear();
    this.rootEl?.remove();
    this.rootEl = null;
    this.timerEl = null;
    this.barFillEl = null;
    this.stepBodyEl = null;
    this.titleEl = null;
    this.subEl = null;
    this.feedbackEl = null;
    this.movePctEl = null;
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
